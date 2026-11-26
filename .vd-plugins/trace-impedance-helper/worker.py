import json
import math
import sys


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    args = payload.get("arguments") or {}
    w = float(args.get("width_mm", 0.34))
    h = float(args.get("height_mm", 0.21))
    er = float(args.get("er", 4.3))
    z0 = (87.0 / math.sqrt(er + 1.41)) * math.log((5.98 * h) / (0.8 * w + 0.035))
    print(json.dumps({"ok": True, "z0_ohm": round(z0, 2), "width_mm": w, "height_mm": h}))


if __name__ == "__main__":
    main()
