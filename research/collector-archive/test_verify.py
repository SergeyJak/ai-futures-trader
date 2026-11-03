import hashlib, importlib.util, json, pathlib, tempfile, unittest
spec=importlib.util.spec_from_file_location('verify',pathlib.Path(__file__).with_name('verify.py'))
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
class Verification(unittest.TestCase):
 def test_corruption_and_empty_snapshot_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);(p/'coverage.json').write_text('{}')
   (p/'manifest.json').write_text(json.dumps({'coverage_sha256':'wrong','files':[]}))
   with self.assertRaises(ValueError):v.verify(p)
 def test_traversal_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);(p/'coverage.json').write_text('{}')
   (p/'manifest.json').write_text(json.dumps({'coverage_sha256':hashlib.sha256(b'{}').hexdigest(),'files':[{'file':'../outside'}]}))
   with self.assertRaises(ValueError):v.verify(p)
