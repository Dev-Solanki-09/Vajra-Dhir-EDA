import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { globalKiCadSyncStore, useKiCadSync } from '../kicadSyncClient';
import { globalStepWorkerClient } from '../workers/stepClient';
import { globalPiHeatmapStore, lookupPiSampleAtWorldMm, samplePiColormapRgb, usePiHeatmap } from '../piHeatmapStore';
import { globalMcadThermalStore, useMcadThermal } from '../mcadThermalStore';
import { useDesignStore } from '../store/useDesignStore';

export interface Component3DMeta {
  uuid: string;
  hwir_uuid: string;
  refdes: string;
  value: string;
  footprint: string;
  x_nm: number;
  y_nm: number;
  rot_mdeg: number;
  x_mm: number;
  y_mm: number;
  rot_deg: number;
  side: 'top' | 'bottom';
  locked: boolean;
  bbox_mm: [number, number, number, number];
  body_size_mm: [number, number, number];
  step_model_name?: string | null;
  step_sha256?: string | null;
  step_url?: string | null;
  step_offset_mm?: [number, number, number];
  step_rotate_deg?: [number, number, number];
  step_scale?: [number, number, number];
}

export interface Board3DMeshPayload {
  board: {
    origin_x_mm: number;
    origin_y_mm: number;
    width_mm: number;
    height_mm: number;
    thickness_mm: number;
  };
  copper_segments: Array<{
    x1_mm: number;
    y1_mm: number;
    x2_mm: number;
    y2_mm: number;
    width_mm: number;
    layer: string;
    net: string;
  }>;
  pads: Array<{
    refdes: string;
    number: string;
    type: string;
    shape: string;
    layer: string;
    x_mm: number;
    y_mm: number;
    sx_mm: number;
    sy_mm: number;
    rot_deg: number;
    drill_mm: number;
    net: string;
  }>;
  vias: Array<{
    x_mm: number;
    y_mm: number;
    size_mm: number;
    drill_mm: number;
    net: string;
  }>;
  components: Component3DMeta[];
  step_models_resolved: number;
}

type Tool3DMode = 'select' | 'translate' | 'rotate';

const MM_TO_NM = 1_000_000;

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  });
}

function aabbOverlap2D(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

export const Viewport3DPanel: React.FC = () => {
  const sync = useKiCadSync();
  const probe = useSyncExternalStore(
    globalCrossProbeBus.subscribeSnapshot,
    globalCrossProbeBus.getSnapshot
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const perspCamRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoCamRef = useRef<THREE.OrthographicCamera | null>(null);
  const activeCamRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const boardRootRef = useRef<THREE.Group | null>(null);
  const fr4MeshRef = useRef<THREE.Mesh | null>(null);
  const copperGroupRef = useRef<THREE.Group | null>(null);
  const viaGroupRef = useRef<THREE.Group | null>(null);
  const partsGroupRef = useRef<THREE.Group | null>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);
  const ghostGroupRef = useRef<THREE.Group | null>(null);
  const enclosureGroupRef = useRef<THREE.Group | null>(null);
  const thermalGroupRef = useRef<THREE.Group | null>(null);
  const compAnchorsRef = useRef<Map<string, THREE.Group>>(new Map());
  const compMetaMapRef = useRef<Map<string, Component3DMeta>>(new Map());
  const camInitializedRef = useRef(false);

  const [meshPayload, setMeshPayload] = useState<Board3DMeshPayload | null>(null);
  const [toolMode, setToolMode] = useState<Tool3DMode>('select');
  const [cameraMode, setCameraMode] = useState<'persp' | 'ortho'>('persp');
  const [xray, setXray] = useState(false);
  const [showFr4, setShowFr4] = useState(true);
  const [showCopper, setShowCopper] = useState(true);
  const [showParts, setShowParts] = useState(true);
  const [actorKind, setActorKind] = useState<'human' | 'agent'>('human');
  const [stepDecodedCount, setStepDecodedCount] = useState(0);
  const [stepExportStatus, setStepExportStatus] = useState('OCCT Worker Ready');
  const [statusNote, setStatusNote] = useState('Blender Orbit · MMB/LMB · G Move · R Rotate · F Flip · L Lock');
  const [aiGhost, setAiGhost] = useState<{ refdes: string; xMm: number; yMm: number } | null>(null);
  const piHeatmap = usePiHeatmap();
  const mcad = useMcadThermal();

  const selectedRefdes = probe.selection.entityIds[0] ?? 'J1';
  const actorKindRef = useRef(actorKind);
  actorKindRef.current = actorKind;

  const toolModeRef = useRef(toolMode);
  toolModeRef.current = toolMode;

  const clashRefs = useMemo(() => {
    const out = new Set<string>();
    const comps = meshPayload?.components ?? [];
    for (let i = 0; i < comps.length; i++) {
      for (let j = i + 1; j < comps.length; j++) {
        if (comps[i].side === comps[j].side && aabbOverlap2D(comps[i].bbox_mm, comps[j].bbox_mm)) {
          out.add(comps[i].refdes);
          out.add(comps[j].refdes);
        }
      }
    }
    const mcadSet = new Set(mcad.showEnclosure ? (mcad.clash?.clashing_refdes ?? []) : []);
    for (const r of mcadSet) out.add(r);
    return out;
  }, [meshPayload, mcad.showEnclosure, mcad.clash]);

  // Fetch /api/v1/3d/board-mesh whenever P1 revision changes
  const fetchBoardMesh = useCallback(async () => {
    try {
      const qs = sync.pcbPath ? `?pcb_path=${encodeURIComponent(sync.pcbPath)}` : '';
      const res = await fetch(`/api/v1/3d/board-mesh${qs}`);
      if (!res.ok) return;
      const data = (await res.json()) as Board3DMeshPayload;
      setMeshPayload(data);
    } catch {
      /* daemon offline */
    }
  }, [sync.pcbPath]);

  useEffect(() => {
    void fetchBoardMesh();
  }, [fetchBoardMesh, sync.revision, sync.pcbSha256]);

  useEffect(() => {
    if (sync.lastEventType === 'mcad:updated') {
      void globalMcadThermalStore.syncFromStatus();
    }
  }, [sync.lastEventType, sync.wsEventSeq]);

  // Snap camera helper (keeps +X right, +Y up, +Z down identically aligned with KiCanvas 2D)
  const snapCamera = useCallback((view: 'iso' | 'top' | 'bottom') => {
    const orbit = orbitRef.current;
    const persp = perspCamRef.current;
    const ortho = orthoCamRef.current;
    const active = activeCamRef.current;
    const b = meshPayload?.board ?? { origin_x_mm: 0, origin_y_mm: 0, width_mm: 60, height_mm: 40, thickness_mm: 1.6 };
    const cx = b.origin_x_mm + b.width_mm / 2;
    const cz = b.origin_y_mm + b.height_mm / 2;
    if (!orbit || !persp || !ortho || !active) return;

    orbit.target.set(cx, 0, cz);
    const dist = Math.max(b.width_mm, b.height_mm) * 1.15;
    if (view === 'iso') {
      persp.position.set(cx + dist * 0.45, dist * 0.65, cz + dist * 0.65);
      ortho.position.copy(persp.position);
    } else if (view === 'top') {
      persp.position.set(cx, dist, cz + 0.01);
      ortho.position.copy(persp.position);
    } else {
      persp.position.set(cx, -dist, cz + 0.01);
      ortho.position.copy(persp.position);
    }
    persp.lookAt(orbit.target);
    ortho.lookAt(orbit.target);
    orbit.update();
  }, [meshPayload?.board]);

  // Initialize Three.js WebGLRenderer, Lights, OrbitControls, and TransformControls
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      setStatusNote(err instanceof Error ? `WebGL unavailable: ${err.message}` : 'WebGL unavailable');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x0b0e14, 1);
    renderer.localClippingEnabled = true;

    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      setStatusNote('WebGL context paused cleanly (waiting for GPU restore)');
    };
    const onContextRestored = () => {
      if (activeCamRef.current) renderer.render(scene, activeCamRef.current);
      setStatusNote('WebGL context restored');
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 260);
    renderer.setSize(width, height, false);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0B0E14');
    sceneRef.current = scene;

    const persp = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    persp.position.set(30, 48, 65);
    perspCamRef.current = persp;

    const aspect = width / height;
    const frustum = 45;
    const ortho = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      -500,
      500
    );
    ortho.position.copy(persp.position);
    orthoCamRef.current = ortho;
    activeCamRef.current = persp;

    const ambient = new THREE.AmbientLight(0xdbeafe, 0.85);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(60, 90, 50);
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.55);
    fillLight.position.set(-40, -50, -30);
    scene.add(ambient, keyLight, fillLight);

    const grid = new THREE.GridHelper(160, 32, 0x1e293b, 0x151a24);
    grid.position.set(30, -1.2, 20);
    scene.add(grid);

    const boardRoot = new THREE.Group();
    const copperGroup = new THREE.Group();
    const viaGroup = new THREE.Group();
    const partsGroup = new THREE.Group();
    const markersGroup = new THREE.Group();
    const ghostGroup = new THREE.Group();
    const enclosureGroup = new THREE.Group();
    const thermalGroup = new THREE.Group();
    boardRoot.add(copperGroup, viaGroup, partsGroup, markersGroup, ghostGroup, enclosureGroup, thermalGroup);
    scene.add(boardRoot);

    boardRootRef.current = boardRoot;
    copperGroupRef.current = copperGroup;
    viaGroupRef.current = viaGroup;
    partsGroupRef.current = partsGroup;
    markersGroupRef.current = markersGroup;
    ghostGroupRef.current = ghostGroup;
    enclosureGroupRef.current = enclosureGroup;
    thermalGroupRef.current = thermalGroup;

    const orbit = new OrbitControls(persp, canvas);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.target.set(30, 0, 20);
    orbit.update();
    orbitRef.current = orbit;

    const tc = new TransformControls(persp, canvas);
    tc.addEventListener('objectChange', () => {
      if (!tc.object || !tc.dragging) return;
      const ref = tc.object.userData?.refdes as string | undefined;
      const meta = ref ? compMetaMapRef.current.get(ref) : undefined;
      if (!ref || !meta) return;
      useDesignStore.getState().setTransientPreview({
        refdes: ref,
        x_nm: Math.round(tc.object.position.x * MM_TO_NM),
        y_nm: Math.round(tc.object.position.z * MM_TO_NM),
        rot_mdeg: Math.round(((tc.object.rotation.y * 180) / Math.PI) * 1000),
        side: meta.side,
        sourcePaneId: 'viewport3d',
        timestamp: performance.now(),
      });
    });
    tc.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !event.value;
      if (!event.value && tc.object) {
        const ref = tc.object.userData?.refdes as string | undefined;
        const meta = ref ? compMetaMapRef.current.get(ref) : undefined;
        if (!ref || !meta) return;

        const nextXNm = Math.round(tc.object.position.x * MM_TO_NM);
        const nextYNm = Math.round(tc.object.position.z * MM_TO_NM);
        const nextRotMdeg = Math.round(((tc.object.rotation.y * 180) / Math.PI) * 1000);
        const effActor = meta.locked ? 'agent' : actorKindRef.current;

        void useDesignStore
          .getState()
          .commitTx(
            'viewport3d',
            [
              {
                op: 'MOVE_COMPONENT',
                component_id: ref,
                refdes: ref,
                x_nm: nextXNm,
                y_nm: nextYNm,
                rot_mdeg: nextRotMdeg,
                side: meta.side,
              },
            ],
            `3D transform ${ref}`,
            effActor
          )
          .then((res) => {
            useDesignStore.getState().clearTransientPreview(ref);
            if (!res.applied) {
              // Restore exact locked coordinates on KERNEL_LOCK_VIOLATION
              tc.object?.position.set(meta.x_mm, tc.object.position.y, meta.y_mm);
              tc.object?.rotation.set(0, (meta.rot_deg * Math.PI) / 180, 0);
              setStatusNote(`${res.error_code ?? 'LOCKED'}: ${ref} restored`);
            } else {
              setStatusNote(`Synced rev ${res.rev_id ?? '?'}: 3D ${ref} -> (${nextXNm} nm, ${nextYNm} nm)`);
            }
          });
      }
    });
    scene.add(tc.getHelper());
    transformRef.current = tc;

    const resizeObserver = new ResizeObserver(() => {
      const w = Math.max(container.clientWidth, 240);
      const h = Math.max(container.clientHeight, 200);
      renderer.setSize(w, h, false);
      persp.aspect = w / h;
      persp.updateProjectionMatrix();
      const asp = w / h;
      ortho.left = (-frustum * asp) / 2;
      ortho.right = (frustum * asp) / 2;
      ortho.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      orbit.update();
      if (activeCamRef.current) {
        renderer.render(scene, activeCamRef.current);
      }
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      resizeObserver.disconnect();
      tc.detach();
      tc.dispose();
      orbit.dispose();
      disposeObjectTree(boardRoot);
      renderer.dispose();
      try {
        renderer.forceContextLoss();
      } catch {
        /* ignore unsupported drivers */
      }
      rendererRef.current = null;
    };
  }, []);

  // Switch between Perspective and Orthographic camera cleanly
  useEffect(() => {
    const orbit = orbitRef.current;
    const tc = transformRef.current;
    const persp = perspCamRef.current;
    const ortho = orthoCamRef.current;
    if (!orbit || !tc || !persp || !ortho) return;

    const nextCam = cameraMode === 'ortho' ? ortho : persp;
    const prevCam = activeCamRef.current;
    if (prevCam && prevCam !== nextCam) {
      nextCam.position.copy(prevCam.position);
      nextCam.lookAt(orbit.target);
    }
    activeCamRef.current = nextCam;
    orbit.object = nextCam;
    tc.camera = nextCam;
    orbit.update();
  }, [cameraMode]);

  // Build / rebuild 3D Board Substrate, Copper, Vias, STEP Instances & DRC Markers from payload
  useEffect(() => {
    const copperGroup = copperGroupRef.current;
    const viaGroup = viaGroupRef.current;
    const partsGroup = partsGroupRef.current;
    const boardRoot = boardRootRef.current;
    if (!meshPayload || !boardRoot || !copperGroup || !viaGroup || !partsGroup) return;

    let cancelled = false;
    const th = meshPayload.board.thickness_mm || 1.6;
    const bw = meshPayload.board.width_mm || 60;
    const bh = meshPayload.board.height_mm || 40;
    const ox = meshPayload.board.origin_x_mm || 0;
    const oy = meshPayload.board.origin_y_mm || 0;

    if (!camInitializedRef.current) {
      camInitializedRef.current = true;
      snapCamera('iso');
    }

    // Clear previous board geometry cleanly
    if (fr4MeshRef.current) {
      boardRoot.remove(fr4MeshRef.current);
      disposeObjectTree(fr4MeshRef.current);
      fr4MeshRef.current = null;
    }
    disposeObjectTree(copperGroup);
    copperGroup.clear();
    disposeObjectTree(viaGroup);
    viaGroup.clear();
    disposeObjectTree(partsGroup);
    partsGroup.clear();
    compAnchorsRef.current.clear();
    compMetaMapRef.current.clear();
    transformRef.current?.detach();

    // 1. FR4 Board Substrate
    const fr4Geo = new THREE.BoxGeometry(bw, th, bh);
    const fr4Mat = new THREE.MeshStandardMaterial({
      color: '#103B2E',
      roughness: 0.72,
      metalness: 0.08,
      transparent: xray,
      opacity: xray ? 0.32 : 1.0,
      depthWrite: !xray,
    });
    const fr4Mesh = new THREE.Mesh(fr4Geo, fr4Mat);
    fr4Mesh.position.set(ox + bw / 2, 0, oy + bh / 2);
    fr4Mesh.visible = showFr4;
    boardRoot.add(fr4Mesh);
    fr4MeshRef.current = fr4Mesh;

    // 2. Copper Traces & Pads (with optional P13 2.5D FEM Viridis/Inferno Heatmap vertex coloring)
    copperGroup.visible = showCopper;
    const fCuMat = new THREE.MeshStandardMaterial({ color: '#E05D44', metalness: 0.75, roughness: 0.35 });
    const bCuMat = new THREE.MeshStandardMaterial({ color: '#3B82F6', metalness: 0.75, roughness: 0.35 });
    const padMat = new THREE.MeshStandardMaterial({ color: '#D0A020', metalness: 0.85, roughness: 0.25 });
    const piActive = Boolean(piHeatmap.enabled && piHeatmap.result?.heatmap);
    const piHm = piActive ? piHeatmap.result!.heatmap : null;
    const useJ = piHeatmap.metric === 'current_density_a_mm2';
    const piDenom = piHm ? Math.max(1e-3, useJ ? piHm.max_current_density_a_mm2 : piHm.max_ir_drop_mv) : 1;

    for (const seg of meshPayload.copper_segments) {
      const dx = seg.x2_mm - seg.x1_mm;
      const dz = seg.y2_mm - seg.y1_mm;
      const len = Math.hypot(dx, dz);
      if (len < 0.001) continue;
      const geo = new THREE.BoxGeometry(len + seg.width_mm * 0.4, 0.04, Math.max(seg.width_mm, 0.12));
      let mat: THREE.MeshStandardMaterial;
      const matchedPi = piHm?.segments.find(
        (ps) =>
          ps.layer === seg.layer &&
          ((Math.hypot(ps.x1_mm - seg.x1_mm, ps.y1_mm - seg.y1_mm) < 0.05 &&
            Math.hypot(ps.x2_mm - seg.x2_mm, ps.y2_mm - seg.y2_mm) < 0.05) ||
            (Math.hypot(ps.x1_mm - seg.x2_mm, ps.y1_mm - seg.y2_mm) < 0.05 &&
              Math.hypot(ps.x2_mm - seg.x1_mm, ps.y2_mm - seg.y1_mm) < 0.05))
      );
      if (piActive && matchedPi) {
        const nomV = piHeatmap.result?.worst_case?.nominal_v || 3.3;
        const tStart = useJ
          ? Math.min(1, matchedPi.current_density_a_mm2 / piDenom)
          : Math.min(1, Math.max(0, (nomV - matchedPi.v_start) * 1000) / piDenom);
        const tEnd = useJ
          ? Math.min(1, matchedPi.current_density_a_mm2 / piDenom)
          : Math.min(1, Math.max(0, (nomV - matchedPi.v_end) * 1000) / piDenom);
        const rgb0 = samplePiColormapRgb(piHeatmap.colormap, tStart);
        const rgb1 = samplePiColormapRgb(piHeatmap.colormap, tEnd);
        const posAttr = geo.attributes.position;
        const colors = new Float32Array(posAttr.count * 3);
        for (let vi = 0; vi < posAttr.count; vi++) {
          const c = posAttr.getX(vi) >= 0 ? rgb1 : rgb0;
          colors[vi * 3] = c[0];
          colors[vi * 3 + 1] = c[1];
          colors[vi * 3 + 2] = c[2];
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.35 });
      } else {
        mat = seg.layer === 'B.Cu' ? bCuMat.clone() : fCuMat.clone();
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (seg.x1_mm + seg.x2_mm) / 2,
        seg.layer === 'B.Cu' ? -th / 2 - 0.025 : th / 2 + 0.025,
        (seg.y1_mm + seg.y2_mm) / 2
      );
      mesh.rotation.y = -Math.atan2(dz, dx);
      mesh.userData = { net: seg.net, isPiHeatmapColored: Boolean(piActive && matchedPi) };
      copperGroup.add(mesh);
    }

    for (const pad of meshPayload.pads) {
      const pGeo =
        pad.shape === 'circle'
          ? new THREE.CylinderGeometry(pad.sx_mm / 2, pad.sx_mm / 2, 0.05, 16)
          : new THREE.BoxGeometry(pad.sx_mm, 0.05, pad.sy_mm);
      const matchedPad = piHm?.pads.find((pp) => pp.refdes === pad.refdes && pp.pad === pad.number);
      const pMat = matchedPad
        ? new THREE.MeshStandardMaterial({
            color: new THREE.Color(...samplePiColormapRgb(piHeatmap.colormap, matchedPad.norm_ir_drop)),
            metalness: 0.4,
            roughness: 0.3,
          })
        : padMat.clone();
      const pMesh = new THREE.Mesh(pGeo, pMat);
      const ySurf = pad.type === 'thru_hole' ? 0 : pad.layer === 'B.Cu' ? -th / 2 - 0.03 : th / 2 + 0.03;
      if (pad.type === 'thru_hole') {
        pMesh.scale.y = (th + 0.12) / 0.05;
      }
      pMesh.position.set(pad.x_mm, ySurf, pad.y_mm);
      if (pad.shape !== 'circle') {
        pMesh.rotation.y = (pad.rot_deg * Math.PI) / 180;
      }
      pMesh.userData = { refdes: pad.refdes, padNumber: pad.number };
      copperGroup.add(pMesh);
    }

    // 3. Plated Vias
    const viaMat = new THREE.MeshStandardMaterial({ color: '#FBBF24', metalness: 0.88, roughness: 0.22 });
    for (const v of meshPayload.vias) {
      const vGeo = new THREE.CylinderGeometry(v.size_mm / 2, v.size_mm / 2, th + 0.12, 16);
      const matchedVia = piHm?.vias.find((pv) => Math.hypot(pv.x_mm - v.x_mm, pv.y_mm - v.y_mm) < 0.05);
      const vMesh = new THREE.Mesh(
        vGeo,
        matchedVia
          ? new THREE.MeshStandardMaterial({
              color: new THREE.Color(...samplePiColormapRgb(piHeatmap.colormap, matchedVia.norm_current_density)),
              metalness: 0.5,
              roughness: 0.25,
            })
          : viaMat.clone()
      );
      vMesh.position.set(v.x_mm, 0, v.y_mm);
      viaGroup.add(vMesh);
    }

    // 3b. P13 PI Bottleneck 3D Beacon Ring when bottleneck exists
    const bn = piActive ? piHeatmap.result?.worst_case?.bottleneck : null;
    if (bn && !piHeatmap.result?.passed) {
      const bnRingGeo = new THREE.RingGeometry(0.9, 1.4, 24);
      bnRingGeo.rotateX(-Math.PI / 2);
      const bnRingMat = new THREE.MeshBasicMaterial({ color: '#EF4444', side: THREE.DoubleSide });
      const bnRing = new THREE.Mesh(bnRingGeo, bnRingMat);
      bnRing.position.set(bn.x_mm, bn.layer === 'B.Cu' ? -th / 2 - 0.09 : th / 2 + 0.09, bn.y_mm);
      bnRing.userData = { isPiBottleneck: true };
      copperGroup.add(bnRing);
    }

    // 4. Component Anchors + STEP Asset Grouping for InstancedMesh Optimization
    partsGroup.visible = showParts;
    const stepGroups = new Map<string, { url: string; comps: Component3DMeta[] }>();

    for (const comp of meshPayload.components) {
      compMetaMapRef.current.set(comp.refdes, comp);

      const anchor = new THREE.Group();
      anchor.position.set(comp.x_mm, comp.side === 'bottom' ? -th / 2 : th / 2, comp.y_mm);
      anchor.rotation.y = (comp.rot_deg * Math.PI) / 180;
      if (comp.side === 'bottom') {
        anchor.rotation.z = Math.PI;
      }
      anchor.userData = { refdes: comp.refdes, hwirUuid: comp.hwir_uuid };

      // Bounding-box / Lock Halo Ring in 3D space
      const [bwC, bhC, bThick] = comp.body_size_mm;
      const isSelected = comp.refdes === selectedRefdes;
      const isClash = clashRefs.has(comp.refdes);
      if (comp.locked || isSelected || isClash) {
        const ringGeo = new THREE.RingGeometry(
          Math.max(bwC, bhC) * 0.55,
          Math.max(bwC, bhC) * 0.65,
          24
        );
        ringGeo.rotateX(-Math.PI / 2);
        const ringColor = isClash ? '#EF4444' : isSelected ? '#38BDF8' : '#FBBF24';
        const ringMat = new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = 0.04;
        ring.userData = { refdes: comp.refdes, isHalo: true };
        anchor.add(ring);
      }

      // Placeholder prism (replaced automatically once occt-import-js Worker returns STEP triangles)
      const bodyGeo = new THREE.BoxGeometry(Math.max(bwC * 0.72, 1.0), bThick, Math.max(bhC * 0.72, 0.8));
      const thermalComp = mcad.showThermal
        ? mcad.thermal?.components.find((tc) => tc.refdes === comp.refdes)
        : undefined;
      const bodyMat = new THREE.MeshStandardMaterial({
        color: isClash
          ? '#EF4444'
          : thermalComp
          ? thermalComp.color
          : comp.locked
          ? '#92400E'
          : '#334155',
        emissive: isClash ? new THREE.Color('#7F1D1D') : new THREE.Color('#000000'),
        roughness: 0.45,
        metalness: 0.2,
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.position.y = bThick / 2;
      bodyMesh.userData = { refdes: comp.refdes, isFallbackBody: true };
      anchor.add(bodyMesh);

      partsGroup.add(anchor);
      compAnchorsRef.current.set(comp.refdes, anchor);

      if (comp.step_sha256 && comp.step_url) {
        const existing = stepGroups.get(comp.step_sha256);
        if (existing) {
          existing.comps.push(comp);
        } else {
          stepGroups.set(comp.step_sha256, { url: comp.step_url, comps: [comp] });
        }
      }
    }

    // 5. Decode unique STEP hashes in isolated OCCT Web Worker & render with THREE.InstancedMesh
    void Promise.all(
      Array.from(stepGroups.entries()).map(async ([sha, info]) => {
        try {
          const decoded = await globalStepWorkerClient.loadStepByUrl(info.url, sha);
          if (cancelled) return;

          // Attach to each component (using InstancedMesh when >= 2 repeated instances)
          for (const meshBuf of decoded.meshes) {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.BufferAttribute(meshBuf.positions, 3));
            if (meshBuf.normals.length === meshBuf.positions.length) {
              geom.setAttribute('normal', new THREE.BufferAttribute(meshBuf.normals, 3));
            }
            geom.setIndex(new THREE.BufferAttribute(meshBuf.indices, 1));
            geom.computeVertexNormals();
            // KiCad .3dshapes STEP Z-up -> Three.js Y-up exact right-handed -90 deg X rotation
            geom.rotateX(-Math.PI / 2);

            const col = new THREE.Color(meshBuf.color[0], meshBuf.color[1], meshBuf.color[2]);
            const mat = new THREE.MeshStandardMaterial({
              color: col,
              metalness: 0.3,
              roughness: 0.45,
            });

            if (info.comps.length > 1) {
              const inst = new THREE.InstancedMesh(geom, mat, info.comps.length);
              const dummy = new THREE.Object3D();
              info.comps.forEach((c, idx) => {
                dummy.position.set(c.x_mm, c.side === 'bottom' ? -th / 2 : th / 2, c.y_mm);
                dummy.rotation.set(0, (c.rot_deg * Math.PI) / 180, c.side === 'bottom' ? Math.PI : 0);
                const sx = c.step_scale?.[0] ?? 1;
                const sy = c.step_scale?.[2] ?? 1;
                const sz = c.step_scale?.[1] ?? 1;
                dummy.scale.set(sx, sy, sz);
                dummy.updateMatrix();
                inst.setMatrixAt(idx, dummy.matrix);

                // Hide fallback prism once real STEP mesh is active
                const anchor = compAnchorsRef.current.get(c.refdes);
                anchor?.children.forEach((ch) => {
                  if (ch.userData?.isFallbackBody) ch.visible = false;
                });
              });
              inst.instanceMatrix.needsUpdate = true;
              inst.userData = { instancedRefs: info.comps.map((c) => c.refdes) };
              partsGroup.add(inst);
            } else {
              const singleComp = info.comps[0];
              const anchor = compAnchorsRef.current.get(singleComp.refdes);
              if (anchor) {
                anchor.children.forEach((ch) => {
                  if (ch.userData?.isFallbackBody) ch.visible = false;
                });
                const subMesh = new THREE.Mesh(geom, mat);
                subMesh.userData = { refdes: singleComp.refdes, isStepMesh: true };
                anchor.add(subMesh);
              }
            }
          }
          setStepDecodedCount(globalStepWorkerClient.getCachedCount());
        } catch (err) {
          setStepExportStatus(err instanceof Error ? `STEP err: ${err.message}` : 'STEP decode error');
        }
      })
    );

    return () => {
      cancelled = true;
    };
  }, [meshPayload, xray, showFr4, showCopper, showParts, selectedRefdes, clashRefs, snapCamera, piHeatmap.enabled, piHeatmap.result, piHeatmap.metric, piHeatmap.colormap, mcad.showThermal, mcad.thermal]);

  // Render P14 CadQuery Parametric Enclosure, Clash Intersections, 3D Cross-Section Slicing Plane, & ElmerFEM Thermal Surface
  useEffect(() => {
    const renderer = rendererRef.current;
    const encGroup = enclosureGroupRef.current;
    const thermGroup = thermalGroupRef.current;
    if (!renderer || !encGroup || !thermGroup) return;

    renderer.clippingPlanes = mcad.sliceEnabled
      ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), mcad.sliceOffsetMm)]
      : [];

    disposeObjectTree(encGroup);
    encGroup.clear();
    if (mcad.showEnclosure && mcad.enclosure) {
      for (const w of mcad.enclosure.walls) {
        const sx = Math.max(0.2, w.max_mm[0] - w.min_mm[0]);
        const sy = Math.max(0.2, w.max_mm[1] - w.min_mm[1]);
        const sz = Math.max(0.2, w.max_mm[2] - w.min_mm[2]);
        const cx = (w.min_mm[0] + w.max_mm[0]) * 0.5;
        const cy = (w.min_mm[1] + w.max_mm[1]) * 0.5;
        const cz = (w.min_mm[2] + w.max_mm[2]) * 0.5;
        // PCB (x, y, z) -> Three.js (x, z, y)
        const geo = new THREE.BoxGeometry(sx, sz, sy);
        const hasClash = Boolean(mcad.clash && !mcad.clash.passed && w.kind === 'lid');
        const mat = new THREE.MeshStandardMaterial({
          color: hasClash ? '#F87171' : w.kind === 'standoff' ? '#64748B' : '#38BDF8',
          transparent: true,
          opacity: w.kind === 'standoff' ? Math.min(0.8, mcad.enclosureOpacity + 0.25) : mcad.enclosureOpacity,
          roughness: 0.4,
          metalness: 0.15,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const box = new THREE.Mesh(geo, mat);
        box.position.set(cx, cz, cy);
        box.userData = { enclosurePart: w.id };
        encGroup.add(box);
      }

      if (mcad.clash && !mcad.clash.passed) {
        for (const cl of mcad.clash.clashes) {
          const b = cl.overlap_box_mm;
          const sx = Math.max(0.3, b[3] - b[0]);
          const sy = Math.max(0.3, b[4] - b[1]);
          const sz = Math.max(0.3, b[5] - b[2]);
          const cGeo = new THREE.BoxGeometry(sx, sz, sy);
          const cMat = new THREE.MeshBasicMaterial({
            color: '#EF4444',
            transparent: true,
            opacity: 0.72,
          });
          const cMesh = new THREE.Mesh(cGeo, cMat);
          cMesh.position.set((b[0] + b[3]) * 0.5, (b[2] + b[5]) * 0.5, (b[1] + b[4]) * 0.5);
          cMesh.userData = { clashRef: cl.refdes };
          encGroup.add(cMesh);
        }
      }
    }

    disposeObjectTree(thermGroup);
    thermGroup.clear();
    if (mcad.showThermal && mcad.thermal && mcad.thermal.surface_grid.length > 0 && meshPayload?.board) {
      const th = meshPayload.board.thickness_mm || 1.6;
      const bw = meshPayload.board.width_mm || 60;
      const bh = meshPayload.board.height_mm || 40;
      const ox = meshPayload.board.origin_x_mm || 0;
      const oy = meshPayload.board.origin_y_mm || 0;
      const nx = mcad.thermal.grid_cols;
      const ny = mcad.thermal.grid_rows;
      const planeGeo = new THREE.PlaneGeometry(bw, bh, Math.max(1, nx - 1), Math.max(1, ny - 1));
      planeGeo.rotateX(-Math.PI / 2);
      const posAttr = planeGeo.attributes.position;
      const colors = new Float32Array(posAttr.count * 3);
      const grid = mcad.thermal.surface_grid;
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          const src = grid[iy * nx + ix];
          const vIdx = iy * nx + ix;
          if (vIdx < posAttr.count && src) {
            const col = new THREE.Color(src.color);
            colors[vIdx * 3] = col.r;
            colors[vIdx * 3 + 1] = col.g;
            colors[vIdx * 3 + 2] = col.b;
          }
        }
      }
      planeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const tMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
      });
      const tMesh = new THREE.Mesh(planeGeo, tMat);
      tMesh.position.set(ox + bw / 2, th / 2 + 0.06, oy + bh / 2);
      thermGroup.add(tMesh);
    }
  }, [
    mcad.showEnclosure,
    mcad.enclosure,
    mcad.enclosureOpacity,
    mcad.clash,
    mcad.sliceEnabled,
    mcad.sliceOffsetMm,
    mcad.showThermal,
    mcad.thermal,
    meshPayload?.board,
  ]);

  // Attach TransformControls dynamically to currently selected anchor
  useEffect(() => {
    const tc = transformRef.current;
    if (!tc) return;
    if (toolMode === 'select') {
      tc.detach();
      return;
    }
    const targetAnchor = compAnchorsRef.current.get(selectedRefdes);
    if (!targetAnchor) {
      tc.detach();
      return;
    }
    tc.attach(targetAnchor);
    if (toolMode === 'translate') {
      tc.setMode('translate');
      tc.showX = true;
      tc.showY = false; // Constrain strictly to PCB plane!
      tc.showZ = true;
    } else {
      tc.setMode('rotate');
      tc.showX = false;
      tc.showY = true; // Rotate around board normal only!
      tc.showZ = false;
    }
  }, [toolMode, selectedRefdes, meshPayload]);

  // Render DRC Markers + Violet AI Ghost in 3D space
  useEffect(() => {
    const markersGroup = markersGroupRef.current;
    const ghostGroup = ghostGroupRef.current;
    if (!markersGroup || !ghostGroup) return;
    const th = meshPayload?.board.thickness_mm ?? 1.6;

    disposeObjectTree(markersGroup);
    markersGroup.clear();
    sync.drcFindings.forEach((f, idx) => {
      const geo = new THREE.SphereGeometry(0.65, 16, 12);
      const mat = new THREE.MeshBasicMaterial({
        color: f.severity === 'error' ? '#EF4444' : '#F59E0B',
      });
      const marker = new THREE.Mesh(geo, mat);
      marker.position.set(f.pos_nm.x_nm / MM_TO_NM, th / 2 + 1.2, f.pos_nm.y_nm / MM_TO_NM);
      marker.userData = { drcIndex: idx };
      markersGroup.add(marker);
    });

    disposeObjectTree(ghostGroup);
    ghostGroup.clear();
    if (aiGhost) {
      const gGeo = new THREE.BoxGeometry(3.2, 1.4, 2.2);
      const gMat = new THREE.MeshBasicMaterial({
        color: '#8B5CF6',
        transparent: true,
        opacity: 0.45,
        wireframe: false,
      });
      const gMesh = new THREE.Mesh(gGeo, gMat);
      gMesh.position.set(aiGhost.xMm, th / 2 + 0.7, aiGhost.yMm);
      ghostGroup.add(gMesh);
    }
  }, [sync.drcFindings, aiGhost, meshPayload?.board.thickness_mm]);

  // Cross-ProbeBus incoming selection from Schematic/PCB/Tree (<16ms focus)
  useEffect(() => {
    return globalCrossProbeBus.onSelection((ev) => {
      if (ev.source === '3d' || !ev.entityIds.length) return;
      const target = compAnchorsRef.current.get(ev.entityIds[0]);
      const orbit = orbitRef.current;
      if (target && orbit) {
        orbit.target.set(target.position.x, target.position.y, target.position.z);
        orbit.update();
      }
    });
  }, []);

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!piHeatmap.enabled || !piHeatmap.result) return;
    const canvas = canvasRef.current;
    const activeCam = activeCamRef.current;
    const copperGroup = copperGroupRef.current;
    if (!canvas || !activeCam || !copperGroup) return;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, activeCam);
    const hits = raycaster.intersectObjects(copperGroup.children, true);
    if (hits.length > 0) {
      const pt = hits[0].point;
      globalPiHeatmapStore.setHoverSample(lookupPiSampleAtWorldMm(piHeatmap.result, pt.x, pt.z));
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const partsGroup = partsGroupRef.current;
    const activeCam = activeCamRef.current;
    if (!canvas || !partsGroup || !activeCam) return;

    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, activeCam);
    const hits = raycaster.intersectObjects(partsGroup.children, true);
    if (hits.length > 0) {
      const hit = hits[0];
      let refdes: string | undefined = hit.object.userData?.refdes;
      if (!refdes && hit.instanceId !== undefined && Array.isArray(hit.object.userData?.instancedRefs)) {
        refdes = hit.object.userData.instancedRefs[hit.instanceId];
      }
      if (!refdes && hit.object.parent?.userData?.refdes) {
        refdes = hit.object.parent.userData.refdes;
      }
      if (refdes) {
        globalCrossProbeBus.select([refdes], '3d');
        setStatusNote(`3D selected ${refdes} (CrossProbe synced <16 ms)`);
      }
    }
  };

  const handleRotate90 = async () => {
    const meta = compMetaMapRef.current.get(selectedRefdes);
    if (!meta) return;
    const effActor = meta.locked ? 'agent' : actorKind;
    const nextRotMdeg = ((meta.rot_mdeg ?? 0) + 90_000) % 360_000;
    await globalKiCadSyncStore.dispatchOps(
      `3D Rotate ${selectedRefdes} +90 deg`,
      [{ op: 'ROTATE_COMPONENT', component_id: selectedRefdes, rot_mdeg: nextRotMdeg }],
      effActor,
      selectedRefdes
    );
  };

  const handleFlipSide = async () => {
    const meta = compMetaMapRef.current.get(selectedRefdes);
    if (!meta) return;
    const effActor = meta.locked ? 'agent' : actorKind;
    const nextSide = meta.side === 'top' ? 'bottom' : 'top';
    await globalKiCadSyncStore.dispatchOps(
      `3D Flip ${selectedRefdes} -> ${nextSide}`,
      [{ op: 'MOVE_COMPONENT', component_id: selectedRefdes, x_nm: meta.x_nm, y_nm: meta.y_nm, rot_mdeg: meta.rot_mdeg, side: nextSide }],
      effActor,
      selectedRefdes
    );
  };

  const handleToggleLock = async () => {
    const meta = compMetaMapRef.current.get(selectedRefdes);
    const nextLocked = meta ? !meta.locked : true;
    await globalKiCadSyncStore.dispatchOps(
      `3D Lock ${selectedRefdes}=${nextLocked}`,
      [{ op: 'SET_LOCK', entity_id: selectedRefdes, locked: nextLocked, reason: nextLocked ? '3d-human-lock' : null }],
      'human',
      selectedRefdes
    );
  };

  const handleExportStep = async () => {
    try {
      const res = await fetch('/api/v1/kicad/export/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sync.pcbPath ? { pcb_path: sync.pcbPath, subst_models: true } : { subst_models: true }),
      });
      const data = await res.json();
      if (res.ok && data.cas_artifact) {
        setStepExportStatus(`STEP CAS: ${String(data.cas_artifact.sha256).slice(0, 12)}`);
      }
    } catch {
      setStepExportStatus('STEP export offline');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const k = e.key.toLowerCase();
    if (k === 'g') {
      e.preventDefault();
      setToolMode((m) => (m === 'translate' ? 'select' : 'translate'));
    } else if (k === 'r') {
      e.preventDefault();
      void handleRotate90();
    } else if (k === 'f') {
      e.preventDefault();
      void handleFlipSide();
    } else if (k === 'l') {
      e.preventDefault();
      void handleToggleLock();
    }
  };

  return (
    <div
      ref={containerRef}
      data-testid="viewport-3d-panel"
      data-step-models-resolved={meshPayload?.step_models_resolved ?? 0}
      data-step-decoded-count={stepDecodedCount}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 380,
        gap: 6,
        outline: 'none',
      }}
    >
      {/* Top Blender-like 3D Toolbar */}
      <div
        className="vd-metric"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 5,
          padding: '6px 8px',
          backgroundColor: 'var(--vd-bg-panel)',
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 6,
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {(['select', 'translate', 'rotate'] as Tool3DMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`vd-btn ${toolMode === m ? 'vd-btn-primary' : ''}`}
              style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }}
              onClick={() => setToolMode(m)}
            >
              {m === 'select' ? 'Orbit/Select' : m === 'translate' ? 'Move (G)' : 'Rotate Gizmo'}
            </button>
          ))}
          <button type="button" className="vd-btn" style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }} onClick={() => void handleRotate90()}>
            +90° (R)
          </button>
          <button type="button" className="vd-btn" style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }} onClick={() => void handleFlipSide()}>
            Flip (F)
          </button>
          <button type="button" className="vd-btn vd-btn-lock" style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }} onClick={() => void handleToggleLock()}>
            Lock (L)
          </button>
          <button type="button" className="vd-btn" style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }} onClick={() => setCameraMode((c) => (c === 'persp' ? 'ortho' : 'persp'))}>
            {cameraMode === 'persp' ? 'Persp' : 'Ortho'}
          </button>
          <button type="button" className="vd-btn" style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }} onClick={() => snapCamera('iso')}>Iso</button>
          <button type="button" className="vd-btn" style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }} onClick={() => snapCamera('top')}>Top</button>
          <button type="button" className="vd-btn" style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }} onClick={() => snapCamera('bottom')}>Bottom</button>
          <button
            type="button"
            className={`vd-btn ${xray ? 'vd-btn-primary' : ''}`}
            style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }}
            onClick={() => setXray((x) => !x)}
          >
            X-Ray
          </button>
          <button type="button" className="vd-btn" style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }} onClick={() => setShowFr4((v) => !v)}>
            FR4:{showFr4 ? 'On' : 'Off'}
          </button>
          <button type="button" className="vd-btn" style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }} onClick={() => setShowCopper((v) => !v)}>
            Cu:{showCopper ? 'On' : 'Off'}
          </button>
          <button type="button" className="vd-btn" style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }} onClick={() => setShowParts((v) => !v)}>
            3D:{showParts ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            className="vd-btn"
            style={{ minHeight: 22, padding: '2px 7px', fontSize: 11, borderColor: 'var(--vd-agent-pulse)' }}
            onClick={() => {
              const target = compMetaMapRef.current.get(selectedRefdes) ?? meshPayload?.components[0];
              if (target) setAiGhost({ refdes: target.refdes, xMm: target.x_mm + 2.5, yMm: target.y_mm + 1.5 });
            }}
          >
            AI 3D Ghost
          </button>
          <button
            type="button"
            data-testid="test-3d-lock-guard-btn"
            className="vd-btn"
            style={{ minHeight: 22, padding: '2px 7px', fontSize: 11, color: 'var(--vd-human-lock)' }}
            onClick={() => {
              const lockedComp = meshPayload?.components.find((c) => c.locked)?.refdes ?? 'J1';
              void globalKiCadSyncStore.dispatchOps(
                `3D Agent attempted mutation on locked ${lockedComp}`,
                [{ op: 'MOVE_COMPONENT', component_id: lockedComp, x_nm: 12_000_000, y_nm: 18_000_000 }],
                'agent',
                lockedComp
              );
            }}
          >
            Test 3D Lock Guard
          </button>
          <button type="button" className="vd-btn vd-btn-primary" style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }} onClick={() => void handleExportStep()}>
            Export STEP
          </button>
          <button
            type="button"
            data-testid="v3d-pi-heatmap-toggle"
            className={`vd-btn ${piHeatmap.enabled ? 'vd-btn-primary' : ''}`}
            style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }}
            disabled={piHeatmap.loading}
            onClick={() => void globalPiHeatmapStore.toggle(sync.pcbPath)}
          >
            {piHeatmap.loading ? 'Solving PI...' : piHeatmap.enabled ? 'PI Heatmap: On' : 'PI Heatmap'}
          </button>
          <button
            type="button"
            data-testid="v3d-enclosure-btn"
            className={`vd-btn ${mcad.showEnclosure ? 'vd-btn-primary' : ''}`}
            style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }}
            disabled={mcad.loadingEnclosure}
            onClick={() => {
              if (mcad.showEnclosure) {
                globalMcadThermalStore.toggleEnclosureOff();
              } else {
                void globalMcadThermalStore.generateEnclosure({ pcbPath: sync.pcbPath });
              }
            }}
          >
            {mcad.loadingEnclosure ? 'CadQuery...' : mcad.showEnclosure ? 'Enclosure: On' : 'Enclosure (CadQuery)'}
          </button>
          {mcad.showEnclosure && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
              Alpha
              <input
                data-testid="v3d-enclosure-opacity"
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={mcad.enclosureOpacity}
                onChange={(e) => globalMcadThermalStore.setEnclosureOpacity(Number(e.target.value))}
                style={{ width: 52 }}
              />
            </label>
          )}
          <button
            type="button"
            data-testid="v3d-slice-toggle"
            className={`vd-btn ${mcad.sliceEnabled ? 'vd-btn-primary' : ''}`}
            style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }}
            onClick={() => globalMcadThermalStore.setSliceEnabled(!mcad.sliceEnabled)}
          >
            {mcad.sliceEnabled ? 'Slice: On' : 'Slice Plane'}
          </button>
          {mcad.sliceEnabled && (
            <input
              data-testid="v3d-slice-slider"
              aria-label="3D Cross-Section Slice Height mm"
              type="range"
              min={-4}
              max={14}
              step={0.5}
              value={mcad.sliceOffsetMm}
              onChange={(e) => globalMcadThermalStore.setSliceOffsetMm(Number(e.target.value))}
              style={{ width: 64 }}
            />
          )}
          <button
            type="button"
            data-testid="v3d-thermal-btn"
            className={`vd-btn ${mcad.showThermal ? 'vd-btn-primary' : ''}`}
            style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }}
            disabled={mcad.loadingThermal}
            onClick={() => {
              if (mcad.showThermal) {
                globalMcadThermalStore.toggleThermalOff();
              } else {
                void globalMcadThermalStore.solveThermal({ pcbPath: sync.pcbPath });
              }
            }}
          >
            {mcad.loadingThermal ? 'ElmerFEM...' : mcad.showThermal ? 'Thermal FEM: On' : 'Thermal FEM'}
          </button>
          <select
            aria-label="3D Actor Mode"
            value={actorKind}
            onChange={(e) => setActorKind(e.target.value as 'human' | 'agent')}
            style={{
              backgroundColor: 'var(--vd-bg-canvas)',
              color: 'var(--vd-text-primary)',
              border: '1px solid var(--vd-border-subtle)',
              borderRadius: 4,
              padding: '2px 4px',
              fontSize: 11,
            }}
          >
            <option value="human">Actor: Human</option>
            <option value="agent">Actor: Agent</option>
          </select>
        </div>

        <span style={{ color: 'var(--vd-text-secondary)' }}>
          STEP: {stepDecodedCount}/{meshPayload?.step_models_resolved ?? 0} · {stepExportStatus}
        </span>
      </div>

      {/* Fail-closed KERNEL_LOCK_VIOLATION Toast */}
      {sync.lockViolation && (
        <div
          data-testid="viewport3d-lock-violation-toast"
          role="alert"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 10px',
            borderRadius: 6,
            backgroundColor: 'rgba(239, 68, 68, 0.14)',
            border: '1px solid var(--vd-human-lock)',
            fontSize: 12,
          }}
        >
          <span>
            <strong style={{ color: 'var(--vd-human-lock)' }}>KERNEL_LOCK_VIOLATION</strong> ·{' '}
            <code>{sync.lockViolation.entityRef}</code> locked ({sync.lockViolation.actorKind} blocked)
          </span>
          <button type="button" className="vd-btn" style={{ minHeight: 20, padding: '1px 6px', fontSize: 11 }} onClick={() => globalKiCadSyncStore.clearLockViolation()}>
            Dismiss
          </button>
        </div>
      )}

      {/* Three.js Canvas + Selectable Component Badges */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 300,
          backgroundColor: '#0B0E14',
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          data-testid="viewport-3d-canvas"
          aria-label="Three.js OCCT 3D PCB Assembly Viewport"
          onPointerMove={handleCanvasPointerMove}
          onClick={handleCanvasClick}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />

        {piHeatmap.enabled && piHeatmap.result && (
          <div
            data-testid="v3d-pi-scale-bar"
            className="vd-metric"
            style={{
              position: 'absolute',
              left: 10,
              bottom: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              padding: '6px 10px',
              backgroundColor: 'rgba(11, 14, 20, 0.92)',
              border: '1px solid var(--vd-border-subtle)',
              borderRadius: 6,
              fontSize: 10,
              pointerEvents: 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--vd-text-primary)' }}>
              <span data-testid="v3d-pi-status">
                3D PI {piHeatmap.result.passed ? 'PASS' : 'BOTTLENECK'} · ΔV {(piHeatmap.result.worst_case?.max_ir_drop_mv ?? 0).toFixed(1)}mV
              </span>
              <span style={{ color: 'var(--vd-text-secondary)' }}>
                0.0 — {(piHeatmap.metric === 'current_density_a_mm2'
                  ? piHeatmap.result.heatmap.max_current_density_a_mm2
                  : piHeatmap.result.heatmap.max_ir_drop_mv
                ).toFixed(1)} {piHeatmap.metric === 'current_density_a_mm2' ? 'A/mm²' : 'mV'}
              </span>
            </div>
            <div
              style={{
                height: 8,
                width: 210,
                borderRadius: 4,
                background: `linear-gradient(90deg, ${piHeatmap.result.heatmap.color_stops.join(', ')})`,
              }}
            />
            <span data-testid="v3d-pi-hover-readout" style={{ color: '#93C5FD' }}>
              {piHeatmap.hoverSample
                ? `${piHeatmap.hoverSample.voltageV.toFixed(3)} V @ ${piHeatmap.hoverSample.currentDensityAMm2.toFixed(1)} A/mm²`
                : `${(piHeatmap.result.worst_case?.min_delivered_v ?? 3.3).toFixed(3)} V @ ${(piHeatmap.result.worst_case?.peak_current_density_a_mm2 ?? 0).toFixed(1)} A/mm²`}
            </span>
          </div>
        )}

        {/* P14 CadQuery Enclosure Clash & ElmerFEM Thermal HUD */}
        {(mcad.showEnclosure || mcad.showThermal) && (
          <div
            data-testid="v3d-thermal-scale-bar"
            className="vd-metric"
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '6px 10px',
              backgroundColor: 'rgba(11, 14, 20, 0.92)',
              border: `1px solid ${mcad.clash && !mcad.clash.passed ? '#EF4444' : 'var(--vd-border-subtle)'}`,
              borderRadius: 6,
              fontSize: 10,
              pointerEvents: 'none',
            }}
          >
            {mcad.showEnclosure && mcad.clash && (
              <span
                data-testid="v3d-mcad-status"
                style={{ color: mcad.clash.passed ? '#6ee7b7' : '#FCA5A5' }}
              >
                {mcad.clash.passed
                  ? `MCAD CLASH: 0.0 mm³ (PASS · lid ${mcad.enclosure?.params.lid_height_mm.toFixed(1)}mm)`
                  : `MCAD CLASH: ${mcad.clash.clash_mm3.toFixed(2)} mm³ (${mcad.clash.clashing_refdes.join(', ')})`}
              </span>
            )}
            {mcad.showThermal && mcad.thermal && (
              <>
                <span
                  data-testid="v3d-thermal-status"
                  style={{ color: mcad.thermal.passed ? '#FDBA74' : '#FCA5A5' }}
                >
                  ElmerFEM {mcad.thermal.min_temp_c.toFixed(1)}°C — {mcad.thermal.max_temp_c.toFixed(1)}°C (Tj max {mcad.thermal.peak_junction_temp_c.toFixed(1)}°C)
                </span>
                <div
                  style={{
                    height: 8,
                    width: 210,
                    borderRadius: 4,
                    background: `linear-gradient(90deg, ${mcad.thermal.color_stops.join(', ')})`,
                  }}
                />
              </>
            )}
          </div>
        )}

        {/* Compact Floating Part Selection & Clash HUD */}
        <div
          className="vd-metric"
          style={{
            position: 'absolute',
            left: 10,
            top: 10,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            maxWidth: 420,
            pointerEvents: 'auto',
          }}
        >
          {(meshPayload?.components ?? []).slice(0, 12).map((c) => {
            const active = c.refdes === selectedRefdes;
            const hasClash = clashRefs.has(c.refdes);
            return (
              <button
                key={c.uuid}
                type="button"
                data-testid={`v3d-chip-${c.refdes}`}
                className={`vd-btn ${active ? 'vd-btn-primary' : ''}`}
                style={{
                  minHeight: 20,
                  padding: '1px 6px',
                  fontSize: 10,
                  borderColor: hasClash ? '#EF4444' : c.locked ? '#FBBF24' : undefined,
                  color: hasClash ? '#FCA5A5' : c.locked ? '#FBBF24' : undefined,
                }}
                onClick={() => {
                  globalCrossProbeBus.select([c.refdes], '3d');
                  const target = compAnchorsRef.current.get(c.refdes);
                  if (target && orbitRef.current) {
                    orbitRef.current.target.set(target.position.x, target.position.y, target.position.z);
                    orbitRef.current.update();
                  }
                }}
              >
                {c.refdes}{c.locked ? '🔒' : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom 3D Readout */}
      <div
        className="vd-metric"
        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--vd-text-secondary)', padding: '2px 4px' }}
      >
        <span>{statusNote}</span>
        <span>
          Selected: {selectedRefdes} · Parts: {meshPayload?.components.length ?? 0} · Clashes: {clashRefs.size}
        </span>
      </div>
    </div>
  );
};
