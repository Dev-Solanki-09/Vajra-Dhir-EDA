"""
Vajra-Dhīr EDA — 3-Channel KiCad 10 Bridge (License-Isolated Ring 2 Subprocess Boundary)

Channel A: Headless S-expression sync (.kicad_sch / .kicad_pcb <-> HW-IR external_id_map)
           with atomic writes (.tmp -> fsync -> os.replace) and 5-second SHA-256 Echo Ring.
Channel B: Optional live KiCad GUI IPC via MIT `kicad-python` (kipy) when KiCad PCB Editor
           is running interactively; degrades gracefully to Channel A/C when headless.
Channel C: Headless `kicad-cli` subprocess runner via `SupervisedProcessGroup` (zero shell
           injection, Windows Job Object / POSIX PR_SET_PDEATHSIG orphan-free cleanup, UTF-8),
           canonical ERC/DRC finding normalization, and content-addressed CasStore caching.

STRICT LICENSE INVARIANT: Never import GPL `pcbnew` in-process in Ring 1.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

try:
    from .supervision import SupervisedProcessGroup
except ImportError:
    _SRC_DIR = str(pathlib.Path(__file__).resolve().parent)
    if _SRC_DIR not in sys.path:
        sys.path.insert(0, _SRC_DIR)
    from supervision import SupervisedProcessGroup

assert "pcbnew" not in sys.modules, "GPL_FIREWALL_VIOLATION: pcbnew must NEVER be imported in Ring 1"

DEFAULT_SUPPRESSION_WINDOW_SEC = 5.0
DEFAULT_CLI_TIMEOUT_SEC = 240.0
INSTALL_KICAD_CMD = "winget install KiCad.KiCad"


def new_uuidv7() -> str:
    """Return an immutable RFC 9562 UUIDv7 string (native in Python 3.14+)."""
    if hasattr(uuid, "uuid7"):
        return str(uuid.uuid7())
    # Fallback monotonic-prefix UUIDv7 construction for older Python runtimes
    ts_ms = int(time.time() * 1000) & ((1 << 48) - 1)
    rand_bytes = bytearray(os.urandom(10))
    rand_bytes[0] = (rand_bytes[0] & 0x0F) | 0x70
    rand_bytes[2] = (rand_bytes[2] & 0x3F) | 0x80
    raw = ts_ms.to_bytes(6, "big") + bytes(rand_bytes)
    return str(uuid.UUID(bytes=raw))


def mm_to_nm(mm: float) -> int:
    """Convert millimeters (float/str) to exact signed i64 nanometers."""
    return int(round(float(mm) * 1_000_000.0))


def nm_to_mm_str(nm: int) -> str:
    """Format i64 nanometers as lossless 6-decimal mm string (zero round-trip drift)."""
    val = int(nm)
    if val == 0:
        return "0"
    neg = val < 0
    aval = abs(val)
    whole, frac = divmod(aval, 1_000_000)
    if frac == 0:
        out = str(whole)
    else:
        out = f"{whole}.{frac:06d}".rstrip("0")
    return f"-{out}" if neg else out


def deg_to_mdeg(deg: float) -> int:
    """Convert degrees to normalized signed i32 millidegrees [0, 360000)."""
    return int(round(float(deg) * 1000.0)) % 360_000


def mdeg_to_deg_str(mdeg: int) -> str:
    """Format i32 millidegrees as lossless degree string."""
    val = int(mdeg) % 360_000
    if val == 0:
        return "0"
    whole, frac = divmod(val, 1000)
    if frac == 0:
        return str(whole)
    return f"{whole}.{frac:03d}".rstrip("0")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


class EchoSuppressionRing:
    """5-second SHA-256 Echo Suppression Ring preventing file-watcher reload loops."""

    def __init__(self, window_sec: float = DEFAULT_SUPPRESSION_WINDOW_SEC) -> None:
        self.window_sec = float(window_sec)
        self._records: Dict[str, float] = {}

    def prune(self) -> None:
        now = time.monotonic()
        expired = [k for k, ts in self._records.items() if (now - ts) > self.window_sec]
        for k in expired:
            del self._records[k]

    def record_write(self, digest_hex: str) -> None:
        self.prune()
        self._records[digest_hex] = time.monotonic()

    def should_suppress(self, digest_hex: str) -> bool:
        self.prune()
        ts = self._records.get(digest_hex)
        return ts is not None and (time.monotonic() - ts) <= self.window_sec

    def active_count(self) -> int:
        self.prune()
        return len(self._records)


def write_text_atomic(path: pathlib.Path, content: str, echo_ring: Optional[EchoSuppressionRing] = None) -> str:
    """Atomically write UTF-8 text via temp file + fsync + os.replace and record SHA-256."""
    path.parent.mkdir(parents=True, exist_ok=True)
    digest = sha256_text(content)
    if echo_ring is not None:
        echo_ring.record_write(digest)
    fd, tmp_name = tempfile.mkstemp(prefix=".vd_kicad_", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    except Exception:
        if os.path.exists(tmp_name):
            os.remove(tmp_name)
        raise
    return digest


class CasStore:
    """Content-Addressed Artifact Store compatible with packages/cas-store/src/lib.rs."""

    def __init__(self, root_dir: pathlib.Path) -> None:
        self.root_dir = pathlib.Path(root_dir)

    def path_for_digest(self, digest: str) -> pathlib.Path:
        if len(digest) < 4:
            raise ValueError(f"Invalid SHA-256 digest: {digest}")
        return self.root_dir / "sha256" / digest[:2] / digest[2:4] / digest

    def put_bytes(self, data: bytes, ext: str = "") -> Dict[str, Any]:
        digest = sha256_bytes(data)
        dest = self.path_for_digest(digest)
        if ext:
            norm_ext = ext if ext.startswith(".") else f".{ext}"
            dest = dest.with_name(f"{digest}{norm_ext}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            fd, tmp_name = tempfile.mkstemp(prefix=".vd_cas_", dir=str(dest.parent))
            try:
                with os.fdopen(fd, "wb") as f:
                    f.write(data)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp_name, dest)
            except Exception:
                if os.path.exists(tmp_name):
                    os.remove(tmp_name)
                raise
        return {
            "cas_uri": f"cas://sha256/{digest}",
            "sha256": digest,
            "size_bytes": len(data),
            "artifact_path": str(dest),
        }

    def put_file(self, src_path: pathlib.Path) -> Dict[str, Any]:
        data = pathlib.Path(src_path).read_bytes()
        info = self.put_bytes(data, ext=pathlib.Path(src_path).suffix)
        info["source_name"] = pathlib.Path(src_path).name
        return info


# ============================================================================
# Deterministic KiCad S-Expression Parser & Emitter (Pure Python, Ring-1 Safe)
# ============================================================================

@dataclass(frozen=True)
class SStr:
    value: str


@dataclass(frozen=True)
class SAtom:
    value: str


SExprNode = SStr | SAtom | list


def tokenize_sexpr(text: str) -> List[Tuple[str, str]]:
    tokens: List[Tuple[str, str]] = []
    n = len(text)
    i = 0
    while i < n:
        ch = text[i]
        if ch in " \t\r\n":
            i += 1
            continue
        if ch == "(":
            tokens.append(("LPAREN", "("))
            i += 1
            continue
        if ch == ")":
            tokens.append(("RPAREN", ")"))
            i += 1
            continue
        if ch == '"':
            i += 1
            buf: List[str] = []
            while i < n:
                c = text[i]
                if c == "\\" and i + 1 < n:
                    nxt = text[i + 1]
                    if nxt == "n":
                        buf.append("\n")
                    elif nxt == "r":
                        buf.append("\r")
                    elif nxt == "t":
                        buf.append("\t")
                    else:
                        buf.append(nxt)
                    i += 2
                    continue
                if c == '"':
                    i += 1
                    break
                buf.append(c)
                i += 1
            tokens.append(("STR", "".join(buf)))
            continue
        j = i
        while j < n and text[j] not in " \t\r\n()\"":
            j += 1
        tokens.append(("ATOM", text[i:j]))
        i = j
    return tokens


def parse_sexpr(text: str) -> List[Any]:
    tokens = tokenize_sexpr(text)
    stack: List[List[Any]] = [[]]
    for kind, val in tokens:
        if kind == "LPAREN":
            new_list: List[Any] = []
            stack[-1].append(new_list)
            stack.append(new_list)
        elif kind == "RPAREN":
            if len(stack) == 1:
                raise ValueError("Unexpected ')' in S-expression")
            stack.pop()
        elif kind == "STR":
            stack[-1].append(SStr(val))
        else:
            stack[-1].append(SAtom(val))
    if len(stack) != 1:
        raise ValueError("Unclosed '(' in S-expression")
    return stack[0]


def _quote_sstr(s: str) -> str:
    escaped = (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )
    return f'"{escaped}"'


def _atom_or_str_val(node: Any) -> str:
    if isinstance(node, (SStr, SAtom)):
        return node.value
    return str(node)


def _head_tag(node: Any) -> Optional[str]:
    if isinstance(node, list) and node and isinstance(node[0], SAtom):
        return node[0].value
    return None


def _find_child(node: list, tag: str) -> Optional[list]:
    for item in node[1:]:
        if _head_tag(item) == tag:
            return item
    return None


def _find_children(node: list, tag: str) -> List[list]:
    return [item for item in node[1:] if _head_tag(item) == tag]


def _find_property(node: list, key: str) -> Optional[list]:
    for item in node[1:]:
        if _head_tag(item) == "property" and len(item) >= 3 and _atom_or_str_val(item[1]) == key:
            return item
    return None


def _is_compact_list(node: list) -> bool:
    if len(node) <= 8 and all(not isinstance(x, list) for x in node):
        return True
    tag = _head_tag(node)
    if tag in ("at", "xy", "pts", "stroke", "fill", "effects", "font", "size", "drill", "layers", "net", "uuid", "start", "end", "mid", "teardrops", "property", "pin"):
        return all(not isinstance(x, list) or _is_compact_list(x) for x in node[1:]) and len(node) <= 10
    return False


def format_sexpr(node: Any, indent: int = 0) -> str:
    if isinstance(node, SStr):
        return _quote_sstr(node.value)
    if isinstance(node, SAtom):
        return node.value
    if not isinstance(node, list):
        return str(node)
    if not node:
        return "()"
    if _is_compact_list(node):
        return "(" + " ".join(format_sexpr(x, indent) for x in node) + ")"
    pad = "\t" * indent
    child_pad = "\t" * (indent + 1)
    parts: List[str] = ["(" + format_sexpr(node[0], indent)]
    i = 1
    while i < len(node):
        item = node[i]
        if not isinstance(item, list):
            parts.append(" " + format_sexpr(item, indent))
            i += 1
        else:
            break
    while i < len(node):
        parts.append("\n" + child_pad + format_sexpr(node[i], indent + 1))
        i += 1
    parts.append("\n" + pad + ")")
    return "".join(parts)


# ============================================================================
# Discovery: KiCad 10 CLI, Official Libraries & Optional Live IPC (Channel B)
# ============================================================================

def _parse_version_tuple(raw: str) -> Tuple[int, ...]:
    m = re.search(r"(\d+)\.(\d+)(?:\.(\d+))?", raw or "")
    if not m:
        return (0, 0, 0)
    return tuple(int(x or 0) for x in m.groups())


def find_kicad_cli() -> Dict[str, Any]:
    """Detect KiCad 10+ `kicad-cli` binary strictly out-of-process."""
    candidates: List[str] = []
    env_cli = os.environ.get("KICAD10_CLI") or os.environ.get("KICAD_CLI")
    if env_cli:
        candidates.append(env_cli)
    which_cli = shutil.which("kicad-cli")
    if which_cli:
        candidates.append(which_cli)
    if sys.platform == "win32":
        local_programs = os.environ.get("LOCALAPPDATA", "")
        if local_programs:
            candidates.extend([
                os.path.join(local_programs, "Programs", "KiCad", "10.0", "bin", "kicad-cli.exe"),
                os.path.join(local_programs, "Programs", "KiCad", "10", "bin", "kicad-cli.exe"),
            ])
        candidates.extend([
            r"C:\Program Files\KiCad\10.0\bin\kicad-cli.exe",
            r"C:\Program Files\KiCad\10\bin\kicad-cli.exe",
            r"C:\Program Files\KiCad\9.0\bin\kicad-cli.exe",
        ])
    else:
        candidates.extend(["/usr/bin/kicad-cli", "/usr/local/bin/kicad-cli"])

    for cand in candidates:
        if cand and os.path.isfile(cand):
            try:
                proc = subprocess.run(
                    [cand, "--version"],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=10,
                )
                ver_str = (proc.stdout or proc.stderr or "").strip()
                ver_tuple = _parse_version_tuple(ver_str)
                return {
                    "installed": proc.returncode == 0,
                    "path": cand,
                    "version": ver_str,
                    "version_tuple": list(ver_tuple),
                    "meets_v10_floor": ver_tuple >= (10, 0, 0),
                    "install_command": INSTALL_KICAD_CMD,
                }
            except Exception as exc:
                return {
                    "installed": False,
                    "path": cand,
                    "version": "",
                    "version_tuple": [0, 0, 0],
                    "meets_v10_floor": False,
                    "error": str(exc),
                    "install_command": INSTALL_KICAD_CMD,
                }

    return {
        "installed": False,
        "path": None,
        "version": None,
        "version_tuple": [0, 0, 0],
        "meets_v10_floor": False,
        "error": f"kicad-cli not found on PATH or standard install locations. Install via: {INSTALL_KICAD_CMD}",
        "install_command": INSTALL_KICAD_CMD,
    }


def resolve_kicad10_libraries(repo_root: Optional[pathlib.Path] = None) -> Dict[str, Any]:
    """Resolve KICAD10_SYMBOL_DIR, KICAD10_FOOTPRINT_DIR, KICAD10_3DMODEL_DIR dynamically."""
    root = pathlib.Path(repo_root) if repo_root else pathlib.Path(__file__).resolve().parents[3]
    pack_2a = root / "workers" / "sources" / "pack-2a-pcb-physics"
    local_share = (
        pathlib.Path(os.environ["LOCALAPPDATA"]) / "Programs" / "KiCad" / "10.0" / "share" / "kicad"
        if os.environ.get("LOCALAPPDATA")
        else pathlib.Path("__nonexistent__")
    )
    win_share = pathlib.Path(r"C:\Program Files\KiCad\10.0\share\kicad")
    posix_share = pathlib.Path("/usr/share/kicad")

    def _pick(env_key: str, *cands: pathlib.Path) -> Optional[str]:
        val = os.environ.get(env_key)
        if val and os.path.isdir(val):
            return val
        for c in cands:
            if c.is_dir():
                return str(c)
        return None

    sym_dir = _pick("KICAD10_SYMBOL_DIR", pack_2a / "kicad-symbols", local_share / "symbols", win_share / "symbols", posix_share / "symbols")
    fp_dir = _pick("KICAD10_FOOTPRINT_DIR", pack_2a / "kicad-footprints", local_share / "footprints", win_share / "footprints", posix_share / "footprints")
    step_dir = _pick("KICAD10_3DMODEL_DIR", pack_2a / "kicad-packages3D", local_share / "3dmodels", win_share / "3dmodels", posix_share / "3dmodels")

    # Link installed KiCad 3D STEP root into gitignored pack-2a directory on Windows/POSIX if absent
    link_target = pack_2a / "kicad-packages3D"
    if step_dir and not link_target.exists() and pathlib.Path(step_dir) != link_target:
        try:
            pack_2a.mkdir(parents=True, exist_ok=True)
            if sys.platform == "win32":
                subprocess.run(
                    ["cmd", "/c", "mklink", "/J", str(link_target), step_dir],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
            else:
                os.symlink(step_dir, link_target)
        except Exception:
            pass

    return {
        "KICAD10_SYMBOL_DIR": sym_dir,
        "KICAD10_FOOTPRINT_DIR": fp_dir,
        "KICAD10_3DMODEL_DIR": step_dir,
        "pack_2a_root": str(pack_2a),
    }


def probe_kicad_ipc() -> Dict[str, Any]:
    """
    Channel B: Probe optional live KiCad 10 PCB Editor NNG/Protobuf IPC via `kicad-python`.
    Fails gracefully to Channel A/C when headless or GUI is closed.
    """
    try:
        import kipy  # type: ignore
    except ImportError:
        return {
            "library_installed": False,
            "gui_connected": False,
            "fallback": "channel_a_sexpr_and_channel_c_cli",
            "detail": "kicad-python (kipy) not installed in active Python runtime",
        }

    try:
        client = kipy.KiCad()
        ver = str(client.get_version()) if hasattr(client, "get_version") else "connected"
        return {
            "library_installed": True,
            "gui_connected": True,
            "kicad_ipc_version": ver,
            "fallback": None,
        }
    except Exception as exc:
        return {
            "library_installed": True,
            "gui_connected": False,
            "fallback": "channel_a_sexpr_and_channel_c_cli",
            "detail": f"KiCad GUI IPC socket unavailable (headless mode): {exc}",
        }


# ============================================================================
# Channel A: Bidirectional HW-IR <-> KiCad S-Expression Sync + Lock Guard
# ============================================================================

def ensure_external_id_map(con: sqlite3.Connection) -> None:
    """Ensure external_id_map exists in SQLite HW-IR database."""
    con.execute("""
        CREATE TABLE IF NOT EXISTS external_id_map (
            hwir_uuid        TEXT NOT NULL,
            entity_table     TEXT NOT NULL,
            external_system  TEXT NOT NULL CHECK(external_system IN ('kicad_sch','kicad_pcb','atopile','tscircuit','klayout_gds')),
            external_key     TEXT NOT NULL,
            last_sync_sha256 TEXT NOT NULL,
            PRIMARY KEY(hwir_uuid, external_system),
            UNIQUE(external_system, external_key)
        )
    """)
    con.commit()


def _get_or_bind_hwir_uuid(
    con: sqlite3.Connection,
    entity_table: str,
    external_system: str,
    external_key: str,
    candidate_uuid: Optional[str],
    digest: str,
) -> str:
    row = con.execute(
        "SELECT hwir_uuid FROM external_id_map WHERE external_system = ? AND external_key = ?",
        (external_system, external_key),
    ).fetchone()
    if row:
        return str(row[0])
    hwir_id = candidate_uuid or new_uuidv7()
    con.execute(
        """
        INSERT OR REPLACE INTO external_id_map (hwir_uuid, entity_table, external_system, external_key, last_sync_sha256)
        VALUES (?, ?, ?, ?, ?)
        """,
        (hwir_id, entity_table, external_system, external_key, digest),
    )
    return hwir_id


def _ensure_external_mapping(
    con: sqlite3.Connection,
    hwir_uuid: str,
    entity_table: str,
    external_system: str,
    external_key: str,
    digest: str,
) -> None:
    con.execute(
        """
        INSERT OR REPLACE INTO external_id_map (hwir_uuid, entity_table, external_system, external_key, last_sync_sha256)
        VALUES (?, ?, ?, ?, ?)
        """,
        (hwir_uuid, entity_table, external_system, external_key, digest),
    )


def _extract_fp_ref_and_val(fp_node: list) -> Tuple[str, str]:
    ref = ""
    val = ""
    for item in fp_node[1:]:
        tag = _head_tag(item)
        if tag == "property" and len(item) >= 3:
            key = _atom_or_str_val(item[1])
            if key == "Reference":
                ref = _atom_or_str_val(item[2])
            elif key == "Value":
                val = _atom_or_str_val(item[2])
        elif tag == "fp_text" and len(item) >= 3:
            kind = _atom_or_str_val(item[1])
            if kind == "reference":
                ref = _atom_or_str_val(item[2])
            elif kind == "value":
                val = _atom_or_str_val(item[2])
    return ref, val


def _set_fp_at_and_lock(fp_node: list, x_nm: int, y_nm: int, rot_mdeg: int, side: str, locked: bool) -> None:
    layer_name = "F.Cu" if side == "top" else "B.Cu"
    layer_node = _find_child(fp_node, "layer")
    if layer_node is not None and len(layer_node) >= 2:
        layer_node[1] = SStr(layer_name)

    at_node = _find_child(fp_node, "at")
    new_at: List[Any] = [SAtom("at"), SAtom(nm_to_mm_str(x_nm)), SAtom(nm_to_mm_str(y_nm))]
    if rot_mdeg % 360_000 != 0:
        new_at.append(SAtom(mdeg_to_deg_str(rot_mdeg)))
    if at_node is not None:
        at_node[:] = new_at
    else:
        fp_node.insert(2, new_at)

    # KiCad 8/10 uses `(locked yes)` (or bare `(locked)` in some files); normalize cleanly
    existing_locked = [idx for idx, it in enumerate(fp_node[1:], 1) if _head_tag(it) == "locked"]
    for idx in reversed(existing_locked):
        fp_node.pop(idx)
    if locked:
        fp_node.insert(3, [SAtom("locked"), SAtom("yes")])


def sync_hwir_to_kicad_pcb(
    con: sqlite3.Connection,
    pcb_path: pathlib.Path,
    echo_ring: Optional[EchoSuppressionRing] = None,
) -> Dict[str, Any]:
    """
    Channel A: Patch an existing `.kicad_pcb` (or create one if missing) from HW-IR SQLite
    while preserving 100% of external_id_map UUID bindings and exact i64 nm coordinates.
    """
    assert "pcbnew" not in sys.modules
    ensure_external_id_map(con)
    pcb_path = pathlib.Path(pcb_path)
    cur = con.cursor()
    board = cur.execute("SELECT id, width_nm, height_nm, thickness_nm FROM boards LIMIT 1").fetchone()
    if not board:
        raise ValueError("No board found in HW-IR database")
    board_id = board[0]

    comps = cur.execute(
        """
        SELECT id, refdes, value_str, footprint_ref, x_nm, y_nm, rot_mdeg, side, locked
        FROM components WHERE board_id = ? AND deleted = 0 ORDER BY refdes
        """,
        (board_id,),
    ).fetchall()
    traces = cur.execute(
        """
        SELECT t.id, t.layer_name, t.x1_nm, t.y1_nm, t.x2_nm, t.y2_nm, t.width_nm, t.locked, n.name
        FROM traces t JOIN nets n ON n.id = t.net_id
        WHERE t.board_id = ? AND t.deleted = 0
        """,
        (board_id,),
    ).fetchall()
    vias = cur.execute(
        """
        SELECT v.id, v.x_nm, v.y_nm, v.diameter_nm, v.drill_nm, v.start_layer, v.end_layer, v.locked, n.name
        FROM vias v JOIN nets n ON n.id = v.net_id
        WHERE v.board_id = ? AND v.deleted = 0
        """,
        (board_id,),
    ).fetchall()

    if pcb_path.exists():
        raw_text = pcb_path.read_text(encoding="utf-8")
        trees = parse_sexpr(raw_text)
        root = trees[0]
    else:
        root = [
            SAtom("kicad_pcb"),
            [SAtom("version"), SAtom("20260101")],
            [SAtom("generator"), SStr("vajra-dhir-eda")],
            [SAtom("generator_version"), SStr("0.0.5")],
            [SAtom("general"), [SAtom("thickness"), SAtom(nm_to_mm_str(board[3]))]],
            [SAtom("layers"), [SAtom("0"), SStr("F.Cu"), SAtom("signal")], [SAtom("31"), SStr("B.Cu"), SAtom("signal")], [SAtom("44"), SStr("Edge.Cuts"), SAtom("user")]],
            [SAtom("net"), SAtom("0"), SStr("")],
            [
                SAtom("gr_rect"),
                [SAtom("start"), SAtom("0"), SAtom("0")],
                [SAtom("end"), SAtom(nm_to_mm_str(board[1])), SAtom(nm_to_mm_str(board[2]))],
                [SAtom("stroke"), [SAtom("width"), SAtom("0.15")], [SAtom("type"), SAtom("solid")]],
                [SAtom("fill"), SAtom("none")],
                [SAtom("layer"), SStr("Edge.Cuts")],
                [SAtom("uuid"), SStr(new_uuidv7())],
            ],
        ]
        trees = [root]

    # Index existing footprints by UUID and Reference
    fp_by_uuid: Dict[str, list] = {}
    fp_by_ref: Dict[str, list] = {}
    for fp in _find_children(root, "footprint"):
        u_node = _find_child(fp, "uuid")
        if u_node and len(u_node) >= 2:
            fp_by_uuid[_atom_or_str_val(u_node[1])] = fp
        ref, _ = _extract_fp_ref_and_val(fp)
        if ref:
            fp_by_ref[ref] = fp

    ext_rows = cur.execute(
        "SELECT hwir_uuid, external_key FROM external_id_map WHERE external_system = 'kicad_pcb'"
    ).fetchall()
    hwir_to_kicad = {str(r[0]): str(r[1]) for r in ext_rows}

    updated_fps = 0
    added_fps = 0
    for cid, refdes, val, fp_ref, x_nm, y_nm, rot_mdeg, side, locked in comps:
        mapped_uuid = hwir_to_kicad.get(cid)
        fp_node = fp_by_uuid.get(mapped_uuid or "") or fp_by_ref.get(refdes)
        if fp_node is not None:
            u_node = _find_child(fp_node, "uuid")
            k_uuid = _atom_or_str_val(u_node[1]) if (u_node and len(u_node) >= 2) else (mapped_uuid or cid)
            if u_node is None:
                fp_node.insert(3, [SAtom("uuid"), SStr(k_uuid)])
            _set_fp_at_and_lock(fp_node, int(x_nm), int(y_nm), int(rot_mdeg), str(side), bool(locked))
            updated_fps += 1
        else:
            k_uuid = mapped_uuid or cid
            layer = "F.Cu" if side == "top" else "B.Cu"
            new_fp: List[Any] = [
                SAtom("footprint"),
                SStr(fp_ref),
                [SAtom("layer"), SStr(layer)],
                [SAtom("uuid"), SStr(k_uuid)],
                [SAtom("at"), SAtom(nm_to_mm_str(x_nm)), SAtom(nm_to_mm_str(y_nm)), SAtom(mdeg_to_deg_str(rot_mdeg))],
                [SAtom("property"), SStr("Reference"), SStr(refdes), [SAtom("at"), SAtom("0"), SAtom("-2")], [SAtom("layer"), SStr("F.SilkS")], [SAtom("uuid"), SStr(new_uuidv7())]],
                [SAtom("property"), SStr("Value"), SStr(val), [SAtom("at"), SAtom("0"), SAtom("2")], [SAtom("layer"), SStr("F.Fab")], [SAtom("uuid"), SStr(new_uuidv7())]],
            ]
            if locked:
                new_fp.insert(4, [SAtom("locked"), SAtom("yes")])
            root.append(new_fp)
            added_fps += 1
        _ensure_external_mapping(con, cid, "components", "kicad_pcb", k_uuid, "")

    # Index existing nets in .kicad_pcb by name
    net_name_to_idx: Dict[str, int] = {}
    max_net_idx = 0
    for net_node in _find_children(root, "net"):
        if len(net_node) >= 3:
            idx = int(_atom_or_str_val(net_node[1]))
            max_net_idx = max(max_net_idx, idx)
            net_name_to_idx[_atom_or_str_val(net_node[2])] = idx

    def _ensure_pcb_net(net_name: str) -> int:
        nonlocal max_net_idx
        if net_name in net_name_to_idx:
            return net_name_to_idx[net_name]
        max_net_idx += 1
        net_name_to_idx[net_name] = max_net_idx
        root.append([SAtom("net"), SAtom(str(max_net_idx)), SStr(net_name)])
        return max_net_idx

    seg_by_uuid: Dict[str, list] = {}
    for seg in _find_children(root, "segment"):
        u_node = _find_child(seg, "uuid")
        if u_node and len(u_node) >= 2:
            seg_by_uuid[_atom_or_str_val(u_node[1])] = seg

    for tid, layer_name, x1_nm, y1_nm, x2_nm, y2_nm, width_nm, locked, net_name in traces:
        k_uuid = hwir_to_kicad.get(tid, tid)
        seg = seg_by_uuid.get(k_uuid)
        if seg is not None:
            st = _find_child(seg, "start")
            en = _find_child(seg, "end")
            wi = _find_child(seg, "width")
            if st is not None:
                st[:] = [SAtom("start"), SAtom(nm_to_mm_str(x1_nm)), SAtom(nm_to_mm_str(y1_nm))]
            if en is not None:
                en[:] = [SAtom("end"), SAtom(nm_to_mm_str(x2_nm)), SAtom(nm_to_mm_str(y2_nm))]
            if wi is not None:
                wi[:] = [SAtom("width"), SAtom(nm_to_mm_str(width_nm))]
        else:
            n_idx = _ensure_pcb_net(str(net_name))
            new_seg = [
                SAtom("segment"),
                [SAtom("start"), SAtom(nm_to_mm_str(x1_nm)), SAtom(nm_to_mm_str(y1_nm))],
                [SAtom("end"), SAtom(nm_to_mm_str(x2_nm)), SAtom(nm_to_mm_str(y2_nm))],
                [SAtom("width"), SAtom(nm_to_mm_str(width_nm))],
                [SAtom("layer"), SStr(str(layer_name))],
                [SAtom("net"), SAtom(str(n_idx))],
                [SAtom("uuid"), SStr(k_uuid)],
            ]
            root.append(new_seg)
        _ensure_external_mapping(con, tid, "traces", "kicad_pcb", k_uuid, "")

    via_by_uuid: Dict[str, list] = {}
    for via in _find_children(root, "via"):
        u_node = _find_child(via, "uuid")
        if u_node and len(u_node) >= 2:
            via_by_uuid[_atom_or_str_val(u_node[1])] = via

    for vid, x_nm, y_nm, dia_nm, drill_nm, s_layer, e_layer, locked, net_name in vias:
        k_uuid = hwir_to_kicad.get(vid, vid)
        via = via_by_uuid.get(k_uuid)
        if via is not None:
            at_n = _find_child(via, "at")
            if at_n is not None:
                at_n[:] = [SAtom("at"), SAtom(nm_to_mm_str(x_nm)), SAtom(nm_to_mm_str(y_nm))]
        else:
            n_idx = _ensure_pcb_net(str(net_name))
            new_via = [
                SAtom("via"),
                [SAtom("at"), SAtom(nm_to_mm_str(x_nm)), SAtom(nm_to_mm_str(y_nm))],
                [SAtom("size"), SAtom(nm_to_mm_str(dia_nm))],
                [SAtom("drill"), SAtom(nm_to_mm_str(drill_nm))],
                [SAtom("layers"), SStr(str(s_layer)), SStr(str(e_layer))],
                [SAtom("net"), SAtom(str(n_idx))],
                [SAtom("uuid"), SStr(k_uuid)],
            ]
            root.append(new_via)
        _ensure_external_mapping(con, vid, "vias", "kicad_pcb", k_uuid, "")

    serialized = format_sexpr(root) + "\n"
    digest = write_text_atomic(pcb_path, serialized, echo_ring=echo_ring)
    con.execute(
        "UPDATE external_id_map SET last_sync_sha256 = ? WHERE external_system = 'kicad_pcb'",
        (digest,),
    )
    con.commit()

    return {
        "direction": "hwir_to_kicad_pcb",
        "pcb_path": str(pcb_path),
        "sha256": digest,
        "updated_footprints": updated_fps,
        "added_footprints": added_fps,
        "traces_mapped": len(traces),
        "vias_mapped": len(vias),
    }


def sync_kicad_pcb_to_hwir(
    con: sqlite3.Connection,
    pcb_path: pathlib.Path,
    actor_kind: str = "import",
    echo_ring: Optional[EchoSuppressionRing] = None,
) -> Dict[str, Any]:
    """
    Channel A: Parse `.kicad_pcb` and import/update entities into SQLite HW-IR.
    Honors the 5s EchoSuppressionRing and SQLite `_tx_actor_ctx` human-lock triggers
    (raises KERNEL_LOCK_VIOLATION if non-human actor mutates a locked=1 entity).
    """
    assert "pcbnew" not in sys.modules
    ensure_external_id_map(con)
    pcb_path = pathlib.Path(pcb_path)
    raw_text = pcb_path.read_text(encoding="utf-8")
    digest = sha256_text(raw_text)

    if echo_ring is not None and echo_ring.should_suppress(digest):
        return {
            "direction": "kicad_pcb_to_hwir",
            "pcb_path": str(pcb_path),
            "sha256": digest,
            "suppressed_by_echo_ring": True,
            "imported_components": 0,
            "updated_components": 0,
        }

    trees = parse_sexpr(raw_text)
    if not trees or _head_tag(trees[0]) != "kicad_pcb":
        raise ValueError(f"Not a valid KiCad PCB S-expression: {pcb_path}")
    root = trees[0]

    cur = con.cursor()
    proj = cur.execute("SELECT id FROM projects LIMIT 1").fetchone()
    board = cur.execute("SELECT id FROM boards LIMIT 1").fetchone()
    if not proj or not board:
        raise ValueError("HW-IR database has no active project/board")
    board_id = board[0]

    net_class_row = cur.execute("SELECT id FROM net_classes WHERE board_id = ? LIMIT 1", (board_id,)).fetchone()
    if not net_class_row:
        nc_id = new_uuidv7()
        cur.execute(
            "INSERT INTO net_classes (id, board_id, name, trace_width_nm, min_width_nm, clearance_nm, via_drill_nm, via_diameter_nm, working_voltage_v) VALUES (?, ?, 'Default', 250000, 150000, 200000, 300000, 600000, 5.0)",
            (nc_id, board_id),
        )
        default_nc_id = nc_id
    else:
        default_nc_id = net_class_row[0]

    # Set actor context INSIDE transaction before mutating locked entities
    cur.execute(
        "UPDATE _tx_actor_ctx SET actor_kind = ?, allow_lock_override = 0 WHERE singleton = 1",
        (actor_kind,),
    )

    # Sync nets
    kicad_nets: Dict[int, str] = {}
    for net_node in _find_children(root, "net"):
        if len(net_node) >= 3:
            net_idx = int(_atom_or_str_val(net_node[1]))
            net_name = _atom_or_str_val(net_node[2]) or f"NET_{net_idx}"
            existing_net = cur.execute(
                "SELECT id FROM nets WHERE board_id = ? AND name = ?",
                (board_id, net_name),
            ).fetchone()
            if existing_net:
                nid = str(existing_net[0])
            else:
                nid = new_uuidv7()
                cur.execute(
                    """
                    INSERT INTO nets (id, board_id, name, net_class_id, signal_role, nominal_voltage_v, is_high_speed, provenance, locked, rev_lamport)
                    VALUES (?, ?, ?, ?, 'generic', 0.0, 0, ?, 0, 1)
                    """,
                    (nid, board_id, net_name, default_nc_id, "human" if actor_kind == "human" else "import"),
                )
            kicad_nets[net_idx] = nid

    imported_comps = 0
    updated_comps = 0
    for fp in _find_children(root, "footprint"):
        fp_ref = _atom_or_str_val(fp[1]) if len(fp) >= 2 else "Unknown:Unknown"
        refdes, value_str = _extract_fp_ref_and_val(fp)
        if not refdes:
            continue
        u_node = _find_child(fp, "uuid")
        k_uuid = _atom_or_str_val(u_node[1]) if (u_node and len(u_node) >= 2) else f"fp:{refdes}"
        at_node = _find_child(fp, "at")
        x_nm = mm_to_nm(float(_atom_or_str_val(at_node[1]))) if (at_node and len(at_node) >= 3) else 0
        y_nm = mm_to_nm(float(_atom_or_str_val(at_node[2]))) if (at_node and len(at_node) >= 3) else 0
        rot_mdeg = deg_to_mdeg(float(_atom_or_str_val(at_node[3]))) if (at_node and len(at_node) >= 4) else 0
        layer_node = _find_child(fp, "layer")
        layer_str = _atom_or_str_val(layer_node[1]) if (layer_node and len(layer_node) >= 2) else "F.Cu"
        side = "bottom" if layer_str.startswith("B.") else "top"
        locked_in_file = 1 if _find_child(fp, "locked") is not None else 0

        existing_map = cur.execute(
            "SELECT hwir_uuid FROM external_id_map WHERE external_system = 'kicad_pcb' AND external_key = ?",
            (k_uuid,),
        ).fetchone()
        existing_comp = None
        if existing_map:
            existing_comp = cur.execute(
                "SELECT id, x_nm, y_nm, rot_mdeg, side, value_str, footprint_ref, locked FROM components WHERE id = ?",
                (existing_map[0],),
            ).fetchone()
        if existing_comp is None:
            existing_comp = cur.execute(
                "SELECT id, x_nm, y_nm, rot_mdeg, side, value_str, footprint_ref, locked FROM components WHERE board_id = ? AND refdes = ?",
                (board_id, refdes),
            ).fetchone()

        if existing_comp is not None:
            cid = str(existing_comp[0])
            changed = (
                int(existing_comp[1]) != x_nm
                or int(existing_comp[2]) != y_nm
                or int(existing_comp[3]) != rot_mdeg
                or str(existing_comp[4]) != side
                or str(existing_comp[5]) != (value_str or refdes)
                or str(existing_comp[6]) != fp_ref
            )
            if changed:
                # SQLite trigger trg_protect_locked_components_upd fires here if existing locked == 1 and actor != human
                cur.execute(
                    """
                    UPDATE components
                    SET x_nm = ?, y_nm = ?, rot_mdeg = ?, side = ?, value_str = ?, footprint_ref = ?, rev_lamport = rev_lamport + 1
                    WHERE id = ?
                    """,
                    (x_nm, y_nm, rot_mdeg, side, value_str or refdes, fp_ref, cid),
                )
                updated_comps += 1
            _ensure_external_mapping(con, cid, "components", "kicad_pcb", k_uuid, digest)
        else:
            cid = new_uuidv7()
            pkg = fp_ref.split(":")[-1] if ":" in fp_ref else fp_ref
            cur.execute(
                """
                INSERT INTO components (
                    id, board_id, refdes, value_str, mpn, package_name, footprint_ref,
                    functional_group, x_nm, y_nm, rot_mdeg, side, courtyard_w_nm, courtyard_h_nm,
                    power_diss_mw, unit_cost_usd, params_json, provenance, locked, lock_owner, lock_reason, rev_lamport
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'general', ?, ?, ?, ?, 2000000, 2000000, 0.0, 0.0, '{}', ?, ?, ?, ?, 1)
                """,
                (
                    cid,
                    board_id,
                    refdes,
                    value_str or refdes,
                    value_str or refdes,
                    pkg,
                    fp_ref,
                    x_nm,
                    y_nm,
                    rot_mdeg,
                    side,
                    "human" if actor_kind == "human" else "import",
                    locked_in_file,
                    "human" if locked_in_file else None,
                    "kicad_import_lock" if locked_in_file else None,
                ),
            )
            _ensure_external_mapping(con, cid, "components", "kicad_pcb", k_uuid, digest)
            imported_comps += 1

    # Sync segments (traces)
    imported_traces = 0
    for seg in _find_children(root, "segment"):
        u_node = _find_child(seg, "uuid")
        st = _find_child(seg, "start")
        en = _find_child(seg, "end")
        wi = _find_child(seg, "width")
        ly = _find_child(seg, "layer")
        nt = _find_child(seg, "net")
        if not (st and en and wi and ly):
            continue
        x1_nm = mm_to_nm(float(_atom_or_str_val(st[1])))
        y1_nm = mm_to_nm(float(_atom_or_str_val(st[2])))
        x2_nm = mm_to_nm(float(_atom_or_str_val(en[1])))
        y2_nm = mm_to_nm(float(_atom_or_str_val(en[2])))
        w_nm = max(1, mm_to_nm(float(_atom_or_str_val(wi[1]))))
        layer_str = _atom_or_str_val(ly[1])
        net_idx = int(_atom_or_str_val(nt[1])) if (nt and len(nt) >= 2) else 0
        net_id = kicad_nets.get(net_idx) or kicad_nets.get(0)
        if not net_id:
            continue
        k_uuid = _atom_or_str_val(u_node[1]) if (u_node and len(u_node) >= 2) else f"seg:{x1_nm}:{y1_nm}:{x2_nm}:{y2_nm}:{layer_str}"
        existing_map = cur.execute(
            "SELECT hwir_uuid FROM external_id_map WHERE external_system = 'kicad_pcb' AND external_key = ?",
            (k_uuid,),
        ).fetchone()
        if existing_map:
            tid = str(existing_map[0])
            existing_tr = cur.execute("SELECT x1_nm, y1_nm, x2_nm, y2_nm, width_nm FROM traces WHERE id = ?", (tid,)).fetchone()
            if existing_tr and (
                int(existing_tr[0]) != x1_nm
                or int(existing_tr[1]) != y1_nm
                or int(existing_tr[2]) != x2_nm
                or int(existing_tr[3]) != y2_nm
                or int(existing_tr[4]) != w_nm
            ):
                cur.execute(
                    "UPDATE traces SET x1_nm = ?, y1_nm = ?, x2_nm = ?, y2_nm = ?, width_nm = ?, rev_lamport = rev_lamport + 1 WHERE id = ?",
                    (x1_nm, y1_nm, x2_nm, y2_nm, w_nm, tid),
                )
            _ensure_external_mapping(con, tid, "traces", "kicad_pcb", k_uuid, digest)
        else:
            tid = new_uuidv7()
            cur.execute(
                """
                INSERT INTO traces (id, board_id, net_id, layer_name, x1_nm, y1_nm, x2_nm, y2_nm, width_nm, provenance, locked, rev_lamport)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
                """,
                (tid, board_id, net_id, layer_str, x1_nm, y1_nm, x2_nm, y2_nm, w_nm, "human" if actor_kind == "human" else "import"),
            )
            _ensure_external_mapping(con, tid, "traces", "kicad_pcb", k_uuid, digest)
            imported_traces += 1

    # Sync vias
    imported_vias = 0
    for via in _find_children(root, "via"):
        u_node = _find_child(via, "uuid")
        at_n = _find_child(via, "at")
        sz_n = _find_child(via, "size")
        dr_n = _find_child(via, "drill")
        ly_n = _find_child(via, "layers")
        nt = _find_child(via, "net")
        if not (at_n and sz_n and dr_n):
            continue
        x_nm = mm_to_nm(float(_atom_or_str_val(at_n[1])))
        y_nm = mm_to_nm(float(_atom_or_str_val(at_n[2])))
        dia_nm = mm_to_nm(float(_atom_or_str_val(sz_n[1])))
        drill_nm = mm_to_nm(float(_atom_or_str_val(dr_n[1])))
        s_layer = _atom_or_str_val(ly_n[1]) if (ly_n and len(ly_n) >= 3) else "F.Cu"
        e_layer = _atom_or_str_val(ly_n[2]) if (ly_n and len(ly_n) >= 3) else "B.Cu"
        net_idx = int(_atom_or_str_val(nt[1])) if (nt and len(nt) >= 2) else 0
        net_id = kicad_nets.get(net_idx) or kicad_nets.get(0)
        if not net_id or dia_nm <= drill_nm:
            continue
        k_uuid = _atom_or_str_val(u_node[1]) if (u_node and len(u_node) >= 2) else f"via:{x_nm}:{y_nm}"
        existing_map = cur.execute(
            "SELECT hwir_uuid FROM external_id_map WHERE external_system = 'kicad_pcb' AND external_key = ?",
            (k_uuid,),
        ).fetchone()
        if existing_map:
            vid = str(existing_map[0])
            existing_v = cur.execute("SELECT x_nm, y_nm, diameter_nm, drill_nm FROM vias WHERE id = ?", (vid,)).fetchone()
            if existing_v and (int(existing_v[0]) != x_nm or int(existing_v[1]) != y_nm):
                cur.execute(
                    "UPDATE vias SET x_nm = ?, y_nm = ?, diameter_nm = ?, drill_nm = ?, rev_lamport = rev_lamport + 1 WHERE id = ?",
                    (x_nm, y_nm, dia_nm, drill_nm, vid),
                )
            _ensure_external_mapping(con, vid, "vias", "kicad_pcb", k_uuid, digest)
        else:
            vid = new_uuidv7()
            cur.execute(
                """
                INSERT INTO vias (id, board_id, net_id, x_nm, y_nm, drill_nm, diameter_nm, start_layer, end_layer, via_kind, provenance, locked, rev_lamport)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'through', ?, 0, 1)
                """,
                (vid, board_id, net_id, x_nm, y_nm, drill_nm, dia_nm, s_layer, e_layer, "human" if actor_kind == "human" else "import"),
            )
            _ensure_external_mapping(con, vid, "vias", "kicad_pcb", k_uuid, digest)
            imported_vias += 1

    # Reset actor context back to human default
    cur.execute("UPDATE _tx_actor_ctx SET actor_kind = 'human', allow_lock_override = 0 WHERE singleton = 1")
    con.commit()

    return {
        "direction": "kicad_pcb_to_hwir",
        "pcb_path": str(pcb_path),
        "sha256": digest,
        "suppressed_by_echo_ring": False,
        "imported_components": imported_comps,
        "updated_components": updated_comps,
        "imported_traces": imported_traces,
        "imported_vias": imported_vias,
    }


def sync_kicad_sch_to_hwir(
    con: sqlite3.Connection,
    sch_path: pathlib.Path,
    actor_kind: str = "import",
    echo_ring: Optional[EchoSuppressionRing] = None,
) -> Dict[str, Any]:
    """Channel A: Parse `.kicad_sch` symbols and map UUIDs in `external_id_map`."""
    assert "pcbnew" not in sys.modules
    ensure_external_id_map(con)
    sch_path = pathlib.Path(sch_path)
    raw_text = sch_path.read_text(encoding="utf-8")
    digest = sha256_text(raw_text)

    if echo_ring is not None and echo_ring.should_suppress(digest):
        return {"direction": "kicad_sch_to_hwir", "sch_path": str(sch_path), "suppressed_by_echo_ring": True, "symbols": []}

    trees = parse_sexpr(raw_text)
    if not trees or _head_tag(trees[0]) != "kicad_sch":
        raise ValueError(f"Not a valid KiCad schematic S-expression: {sch_path}")
    root = trees[0]

    cur = con.cursor()
    board = cur.execute("SELECT id FROM boards LIMIT 1").fetchone()
    if not board:
        raise ValueError("HW-IR database has no active board")
    board_id = board[0]

    mapped_symbols: List[Dict[str, Any]] = []
    for sym in _find_children(root, "symbol"):
        lib_id_n = _find_child(sym, "lib_id")
        if not lib_id_n or len(lib_id_n) < 2:
            continue
        lib_id = _atom_or_str_val(lib_id_n[1])
        ref_p = _find_property(sym, "Reference")
        val_p = _find_property(sym, "Value")
        fp_p = _find_property(sym, "Footprint")
        refdes = _atom_or_str_val(ref_p[2]) if (ref_p and len(ref_p) >= 3) else ""
        value_str = _atom_or_str_val(val_p[2]) if (val_p and len(val_p) >= 3) else ""
        footprint = _atom_or_str_val(fp_p[2]) if (fp_p and len(fp_p) >= 3) else ""
        if not refdes or refdes.startswith("#"):
            continue
        u_node = _find_child(sym, "uuid")
        k_uuid = _atom_or_str_val(u_node[1]) if (u_node and len(u_node) >= 2) else f"sch:{refdes}"
        at_node = _find_child(sym, "at")
        x_nm = mm_to_nm(float(_atom_or_str_val(at_node[1]))) if (at_node and len(at_node) >= 3) else 0
        y_nm = mm_to_nm(float(_atom_or_str_val(at_node[2]))) if (at_node and len(at_node) >= 3) else 0
        rot_mdeg = deg_to_mdeg(float(_atom_or_str_val(at_node[3]))) if (at_node and len(at_node) >= 4) else 0

        existing_comp = cur.execute(
            "SELECT id FROM components WHERE board_id = ? AND refdes = ?",
            (board_id, refdes),
        ).fetchone()
        cid = str(existing_comp[0]) if existing_comp else new_uuidv7()
        _ensure_external_mapping(con, cid, "components", "kicad_sch", k_uuid, digest)
        mapped_symbols.append({
            "hwir_uuid": cid,
            "kicad_uuid": k_uuid,
            "refdes": refdes,
            "value": value_str,
            "lib_id": lib_id,
            "footprint": footprint,
            "x_nm": x_nm,
            "y_nm": y_nm,
            "rot_mdeg": rot_mdeg,
        })

    con.commit()
    return {
        "direction": "kicad_sch_to_hwir",
        "sch_path": str(sch_path),
        "sha256": digest,
        "suppressed_by_echo_ring": False,
        "symbols_mapped": len(mapped_symbols),
        "symbols": mapped_symbols,
    }


# ============================================================================
# Channel C: Supervised `kicad-cli` Worker + Canonical Findings + CasStore
# ============================================================================

def _run_kicad_cli(
    args: List[str],
    cwd: Optional[pathlib.Path] = None,
    timeout_sec: float = DEFAULT_CLI_TIMEOUT_SEC,
) -> Dict[str, Any]:
    cli_info = find_kicad_cli()
    if not cli_info.get("installed") or not cli_info.get("path"):
        raise FileNotFoundError(
            cli_info.get("error") or f"kicad-cli missing. Install via: {INSTALL_KICAD_CMD}"
        )
    cmd = [cli_info["path"], *args]
    libs = resolve_kicad10_libraries()
    env = dict(os.environ)
    for k in ("KICAD10_SYMBOL_DIR", "KICAD10_FOOTPRINT_DIR", "KICAD10_3DMODEL_DIR"):
        if libs.get(k):
            env.setdefault(k, libs[k])
    with SupervisedProcessGroup() as sup:
        # Capture UTF-8 output cleanly via pipe on SupervisedProcessGroup
        orig_spawn = sup.spawn

        def _spawn_captured() -> subprocess.Popen:
            kwargs: Dict[str, Any] = {
                "cwd": str(cwd) if cwd else None,
                "env": env,
                "stdout": subprocess.PIPE,
                "stderr": subprocess.PIPE,
            }
            if sys.platform == "win32":
                proc = subprocess.Popen(cmd, **kwargs)
                if sup._job_handle and sup._k32 is not None:
                    import ctypes
                    import ctypes.wintypes as wintypes
                    if not sup._k32.AssignProcessToJobObject(sup._job_handle, wintypes.HANDLE(int(proc._handle))):
                        err = ctypes.get_last_error()
                        proc.kill()
                        raise OSError(err, "AssignProcessToJobObject failed")
            else:
                proc = orig_spawn(cmd, cwd=str(cwd) if cwd else None)
            sup._children.append(proc)
            return proc

        proc = _spawn_captured()
        try:
            out_b, err_b = proc.communicate(timeout=timeout_sec)
        except subprocess.TimeoutExpired:
            proc.kill()
            out_b, err_b = proc.communicate()
            raise TimeoutError(f"kicad-cli timed out after {timeout_sec}s: {' '.join(args)}")

        stdout = (out_b or b"").decode("utf-8", errors="replace")
        stderr = (err_b or b"").decode("utf-8", errors="replace")
        return {
            "returncode": proc.returncode,
            "cmd": cmd,
            "stdout": stdout,
            "stderr": stderr,
            "kicad_version": cli_info["version"],
        }


def _normalize_violations(
    raw_report: Dict[str, Any],
    con: Optional[sqlite3.Connection],
    external_system: str,
) -> List[Dict[str, Any]]:
    ext_map: Dict[str, str] = {}
    if con is not None:
        try:
            rows = con.execute(
                "SELECT external_key, hwir_uuid FROM external_id_map WHERE external_system = ?",
                (external_system,),
            ).fetchall()
            ext_map = {str(r[0]): str(r[1]) for r in rows}
        except sqlite3.Error:
            ext_map = {}

    findings: List[Dict[str, Any]] = []

    def _collect(items: List[Dict[str, Any]]) -> None:
        for v in items or []:
            sev = str(v.get("severity", "warning")).lower()
            if sev not in ("error", "warning", "info"):
                sev = "warning"
            rule_id = str(v.get("type", "kicad_rule"))
            msg = str(v.get("description", ""))
            v_items = v.get("items") or []
            primary_uuid = None
            pos_nm = {"x_nm": 0, "y_nm": 0}
            if v_items:
                first_item = v_items[0]
                raw_uuid = str(first_item.get("uuid", "") or "")
                primary_uuid = ext_map.get(raw_uuid, raw_uuid or None)
                pos = first_item.get("pos") or {}
                if "x" in pos and "y" in pos:
                    pos_nm = {"x_nm": mm_to_nm(pos["x"]), "y_nm": mm_to_nm(pos["y"])}
            findings.append({
                "entity_uuid": primary_uuid,
                "severity": sev,
                "rule_id": rule_id,
                "message": msg,
                "pos_nm": pos_nm,
            })

    _collect(raw_report.get("violations") or [])
    _collect(raw_report.get("unconnected_items") or [])
    _collect(raw_report.get("schematic_parity") or [])
    for sheet in raw_report.get("sheets") or []:
        _collect(sheet.get("violations") or [])

    return findings


class KiCad10Bridge:
    """Unified 3-Channel KiCad 10 Bridge bound to a CasStore and HW-IR SQLite connection."""

    def __init__(self, cas_dir: pathlib.Path = pathlib.Path(".vd-dev/cas")) -> None:
        self.cas = CasStore(cas_dir)
        self.echo_ring = EchoSuppressionRing()

    def status(self) -> Dict[str, Any]:
        return {
            "engine": "kicad10-3channel-bridge",
            "pcbnew_in_process": "pcbnew" in sys.modules,
            "channel_a": {
                "mode": "headless_sexpr_hwir_sync",
                "echo_suppression_window_sec": self.echo_ring.window_sec,
                "echo_ring_active_entries": self.echo_ring.active_count(),
            },
            "channel_b": probe_kicad_ipc(),
            "channel_c": find_kicad_cli(),
            "libraries": resolve_kicad10_libraries(),
        }

    def run_erc(self, sch_path: pathlib.Path, con: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
        sch_path = pathlib.Path(sch_path).resolve()
        if not sch_path.is_file():
            raise FileNotFoundError(f"Schematic file not found: {sch_path}")
        with tempfile.TemporaryDirectory(prefix="vd_erc_") as tmp:
            out_json = pathlib.Path(tmp) / "erc_report.json"
            proc_res = _run_kicad_cli(["sch", "erc", "--format", "json", "-o", str(out_json), str(sch_path)])
            if not out_json.is_file():
                raise RuntimeError(f"kicad-cli sch erc failed (rc={proc_res['returncode']}): {proc_res['stderr']}")
            raw_report = json.loads(out_json.read_text(encoding="utf-8"))
            cas_meta = self.cas.put_file(out_json)

        findings = _normalize_violations(raw_report, con, "kicad_sch")
        errors = sum(1 for f in findings if f["severity"] == "error")
        warnings = sum(1 for f in findings if f["severity"] == "warning")
        return {
            "success": True,
            "channel": "C:kicad-cli",
            "kicad_version": proc_res["kicad_version"],
            "sch_path": str(sch_path),
            "passed": errors == 0,
            "error_count": errors,
            "warning_count": warnings,
            "findings": findings,
            "cas_artifact": cas_meta,
        }

    def run_drc(self, pcb_path: pathlib.Path, con: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
        pcb_path = pathlib.Path(pcb_path).resolve()
        if not pcb_path.is_file():
            raise FileNotFoundError(f"PCB file not found: {pcb_path}")
        with tempfile.TemporaryDirectory(prefix="vd_drc_") as tmp:
            out_json = pathlib.Path(tmp) / "drc_report.json"
            proc_res = _run_kicad_cli(["pcb", "drc", "--format", "json", "-o", str(out_json), str(pcb_path)])
            if not out_json.is_file():
                raise RuntimeError(f"kicad-cli pcb drc failed (rc={proc_res['returncode']}): {proc_res['stderr']}")
            raw_report = json.loads(out_json.read_text(encoding="utf-8"))
            cas_meta = self.cas.put_file(out_json)

        findings = _normalize_violations(raw_report, con, "kicad_pcb")
        errors = sum(1 for f in findings if f["severity"] == "error")
        warnings = sum(1 for f in findings if f["severity"] == "warning")
        return {
            "success": True,
            "channel": "C:kicad-cli",
            "kicad_version": proc_res["kicad_version"],
            "pcb_path": str(pcb_path),
            "passed": errors == 0,
            "error_count": errors,
            "warning_count": warnings,
            "findings": findings,
            "cas_artifact": cas_meta,
        }

    def export_netlist(self, sch_path: pathlib.Path) -> Dict[str, Any]:
        sch_path = pathlib.Path(sch_path).resolve()
        if not sch_path.is_file():
            raise FileNotFoundError(f"Schematic file not found: {sch_path}")
        with tempfile.TemporaryDirectory(prefix="vd_net_") as tmp:
            out_net = pathlib.Path(tmp) / "netlist.net"
            proc_res = _run_kicad_cli(["sch", "export", "netlist", "--format", "kicadsexpr", "-o", str(out_net), str(sch_path)])
            if proc_res["returncode"] != 0 or not out_net.is_file():
                raise RuntimeError(f"kicad-cli netlist export failed: {proc_res['stderr']}")
            net_text = out_net.read_text(encoding="utf-8")
            cas_meta = self.cas.put_file(out_net)

        trees = parse_sexpr(net_text)
        nets: List[Dict[str, Any]] = []
        components: List[Dict[str, str]] = []
        if trees:
            root = trees[0]
            comps_blk = _find_child(root, "components")
            if comps_blk:
                for c in _find_children(comps_blk, "comp"):
                    ref_n = _find_child(c, "ref")
                    val_n = _find_child(c, "value")
                    fp_n = _find_child(c, "footprint")
                    components.append({
                        "ref": _atom_or_str_val(ref_n[1]) if (ref_n and len(ref_n) >= 2) else "",
                        "value": _atom_or_str_val(val_n[1]) if (val_n and len(val_n) >= 2) else "",
                        "footprint": _atom_or_str_val(fp_n[1]) if (fp_n and len(fp_n) >= 2) else "",
                    })
            nets_blk = _find_child(root, "nets")
            if nets_blk:
                for n in _find_children(nets_blk, "net"):
                    name_n = _find_child(n, "name")
                    nodes = []
                    for nd in _find_children(n, "node"):
                        rn = _find_child(nd, "ref")
                        pn = _find_child(nd, "pin")
                        nodes.append({
                            "ref": _atom_or_str_val(rn[1]) if (rn and len(rn) >= 2) else "",
                            "pin": _atom_or_str_val(pn[1]) if (pn and len(pn) >= 2) else "",
                        })
                    nets.append({
                        "name": _atom_or_str_val(name_n[1]) if (name_n and len(name_n) >= 2) else "",
                        "nodes": nodes,
                    })

        return {
            "success": True,
            "channel": "C:kicad-cli",
            "kicad_version": proc_res["kicad_version"],
            "component_count": len(components),
            "net_count": len(nets),
            "components": components,
            "nets": nets,
            "cas_artifact": cas_meta,
        }

    def export_gerbers_and_drill(self, pcb_path: pathlib.Path) -> Dict[str, Any]:
        pcb_path = pathlib.Path(pcb_path).resolve()
        if not pcb_path.is_file():
            raise FileNotFoundError(f"PCB file not found: {pcb_path}")
        with tempfile.TemporaryDirectory(prefix="vd_gerb_") as tmp:
            out_dir = pathlib.Path(tmp) / "fab"
            out_dir.mkdir(parents=True, exist_ok=True)
            g_res = _run_kicad_cli(["pcb", "export", "gerbers", "-o", str(out_dir) + os.sep, str(pcb_path)])
            if g_res["returncode"] != 0:
                raise RuntimeError(f"kicad-cli gerbers failed: {g_res['stderr']}")
            d_res = _run_kicad_cli(["pcb", "export", "drill", "-o", str(out_dir) + os.sep, str(pcb_path)])
            if d_res["returncode"] != 0:
                raise RuntimeError(f"kicad-cli drill failed: {d_res['stderr']}")
            artifacts = []
            for f in sorted(out_dir.iterdir()):
                if f.is_file() and f.stat().st_size > 0:
                    artifacts.append(self.cas.put_file(f))
            manifest_bytes = json.dumps({"pcb": pcb_path.name, "files": artifacts}, indent=2).encode("utf-8")
            manifest_cas = self.cas.put_bytes(manifest_bytes, ext=".json")
        return {
            "success": len(artifacts) > 0,
            "channel": "C:kicad-cli",
            "kicad_version": g_res["kicad_version"],
            "file_count": len(artifacts),
            "files": artifacts,
            "cas_artifact": manifest_cas,
        }

    def export_gerbers_with_contents(self, pcb_path: pathlib.Path) -> Dict[str, Any]:
        pcb_path = pathlib.Path(pcb_path).resolve()
        if not pcb_path.is_file():
            raise FileNotFoundError(f"PCB file not found: {pcb_path}")
        pcb_sha = sha256_text(pcb_path.read_text(encoding="utf-8", errors="replace"))
        with tempfile.TemporaryDirectory(prefix="vd_gerb_txt_") as tmp:
            out_dir = pathlib.Path(tmp) / "fab"
            out_dir.mkdir(parents=True, exist_ok=True)
            g_res = _run_kicad_cli(["pcb", "export", "gerbers", "-o", str(out_dir) + os.sep, str(pcb_path)])
            if g_res["returncode"] != 0:
                raise RuntimeError(f"kicad-cli gerbers failed: {g_res['stderr']}")
            d_res = _run_kicad_cli(["pcb", "export", "drill", "-o", str(out_dir) + os.sep, str(pcb_path)])
            if d_res["returncode"] != 0:
                raise RuntimeError(f"kicad-cli drill failed: {d_res['stderr']}")
            files_out = []
            for f in sorted(out_dir.iterdir()):
                if f.is_file() and f.stat().st_size > 0 and f.suffix.lower() in (".gbr", ".drl", ".gko", ".gm1", ".gm2", ".gtl", ".gbl", ".gts", ".gbs", ".gto", ".gbo", ".gtp", ".gbp", ".g1", ".g2", ".g3", ".g4"):
                    meta = self.cas.put_file(f)
                    files_out.append({
                        "filename": f.name,
                        "sha256": meta["sha256"],
                        "bytes": meta.get("bytes", meta.get("size_bytes", f.stat().st_size)),
                        "content": f.read_text(encoding="utf-8", errors="replace"),
                    })
        return {
            "success": len(files_out) > 0,
            "channel": "C:kicad-cli",
            "kicad_version": g_res["kicad_version"],
            "pcb_sha256": pcb_sha,
            "file_count": len(files_out),
            "files": files_out,
        }

    def export_ipc2581(self, pcb_path: pathlib.Path) -> Dict[str, Any]:
        pcb_path = pathlib.Path(pcb_path).resolve()
        if not pcb_path.is_file():
            raise FileNotFoundError(f"PCB file not found: {pcb_path}")
        with tempfile.TemporaryDirectory(prefix="vd_ipc2581_") as tmp:
            out_xml = pathlib.Path(tmp) / f"{pcb_path.stem}.xml"
            res = _run_kicad_cli(["pcb", "export", "ipc2581", "-o", str(out_xml), str(pcb_path)])
            if res["returncode"] != 0 or not out_xml.is_file() or out_xml.stat().st_size == 0:
                raise RuntimeError(f"kicad-cli ipc2581 failed: {res['stderr']}")
            cas_meta = self.cas.put_file(out_xml)
        return {
            "success": True,
            "channel": "C:kicad-cli",
            "kicad_version": res["kicad_version"],
            "format": "IPC-2581",
            "cas_artifact": cas_meta,
        }

    def export_step(self, pcb_path: pathlib.Path, subst_models: bool = True) -> Dict[str, Any]:
        pcb_path = pathlib.Path(pcb_path).resolve()
        if not pcb_path.is_file():
            raise FileNotFoundError(f"PCB file not found: {pcb_path}")
        with tempfile.TemporaryDirectory(prefix="vd_step_") as tmp:
            out_step = pathlib.Path(tmp) / f"{pcb_path.stem}.step"
            args = ["pcb", "export", "step", "--force"]
            if subst_models:
                args.append("--subst-models")
            args.extend(["-o", str(out_step), str(pcb_path)])
            res = _run_kicad_cli(args)
            if res["returncode"] != 0 or not out_step.is_file() or out_step.stat().st_size == 0:
                raise RuntimeError(f"kicad-cli step export failed: {res['stderr']}")
            cas_meta = self.cas.put_file(out_step)
        return {
            "success": True,
            "channel": "C:kicad-cli",
            "kicad_version": res["kicad_version"],
            "format": "STEP",
            "cas_artifact": cas_meta,
        }

    def export_sch_pdf(self, sch_path: pathlib.Path) -> Dict[str, Any]:
        sch_path = pathlib.Path(sch_path).resolve()
        if not sch_path.is_file():
            raise FileNotFoundError(f"Schematic file not found: {sch_path}")
        with tempfile.TemporaryDirectory(prefix="vd_schpdf_") as tmp:
            out_pdf = pathlib.Path(tmp) / f"{sch_path.stem}.pdf"
            res = _run_kicad_cli(["sch", "export", "pdf", "-o", str(out_pdf), str(sch_path)])
            if res["returncode"] != 0 or not out_pdf.is_file() or out_pdf.stat().st_size == 0:
                raise RuntimeError(f"kicad-cli sch pdf export failed: {res['stderr']}")
            cas_meta = self.cas.put_file(out_pdf)
        return {
            "success": True,
            "channel": "C:kicad-cli",
            "kicad_version": res["kicad_version"],
            "format": "PDF",
            "cas_artifact": cas_meta,
        }
