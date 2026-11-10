import io
import pathlib
import sys
import unittest
import urllib.error
from unittest.mock import Mock, call

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from collector_http import read_bytes, RETRY_DELAYS

URL = "https://example.invalid/api/research-data"

def http_error(code):
    return urllib.error.HTTPError(URL, code, "test", None, None)

class ResearchHttpRetryTest(unittest.TestCase):
    def test_restart_502_recovers_after_bounded_backoff(self):
        opener = Mock(side_effect=[http_error(502)]*5 + [io.BytesIO(b'{"ok":true}')])
        sleeper = Mock()
        self.assertEqual(read_bytes(URL, opener=opener, sleeper=sleeper), b'{"ok":true}')
        self.assertEqual(sleeper.call_args_list, [call(x) for x in RETRY_DELAYS[:5]])
        self.assertEqual(opener.call_count, 6)
        self.assertGreater(sum(RETRY_DELAYS), 69)

    def test_permanent_http_error_fails_immediately(self):
        opener = Mock(side_effect=http_error(404))
        sleeper = Mock()
        with self.assertRaises(urllib.error.HTTPError):
            read_bytes(URL, opener=opener, sleeper=sleeper)
        self.assertEqual(opener.call_count, 1)
        sleeper.assert_not_called()

    def test_exhaustion_never_returns_empty_success(self):
        opener = Mock(side_effect=http_error(503))
        sleeper = Mock()
        with self.assertRaises(urllib.error.HTTPError):
            read_bytes(URL, opener=opener, sleeper=sleeper, delays=(1,2))
        self.assertEqual(opener.call_count, 3)
        self.assertEqual(sleeper.call_args_list, [call(1),call(2)])

    def test_transport_error_and_rate_limit_recover(self):
        opener = Mock(side_effect=[urllib.error.URLError("reset"), http_error(429), io.BytesIO(b"data")])
        sleeper = Mock()
        self.assertEqual(read_bytes(URL, opener=opener, sleeper=sleeper, delays=(1,2)), b"data")
        self.assertEqual(sleeper.call_args_list, [call(1),call(2)])

if __name__ == "__main__":
    unittest.main()
