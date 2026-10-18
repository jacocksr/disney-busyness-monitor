import hashlib, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "source-manifest.json").read_text(encoding="utf-8"))
text = (ROOT / "index.html").read_text(encoding="utf-8")
for item in manifest["source_blocks"]:
    body = (ROOT / item["path"]).read_text(encoding="utf-8")
    assert hashlib.sha256(body.encode()).hexdigest() == item["sha256"], item["path"]
    assert text.count(item["replacement"]) == 1, item["path"]
    text = text.replace(item["replacement"], item["original_opening_tag"] + body + "</" + item["kind"] + ">")
assert hashlib.sha256(text.encode()).hexdigest() == manifest["baseline_sha256"]
assert text.encode() == (ROOT / "tests/reference.html").read_bytes()
print("PASS: all 28 source blocks preserved; reconstructed source is byte-identical to original.")
