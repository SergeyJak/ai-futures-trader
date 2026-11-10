"""Bounded retry for read-only research HTTP during collector restarts."""
import http.client
import time
import urllib.error
import urllib.request

# Railway can report SUCCESS before the HTTP listener is ready. Observed
# startup took 69s; the old 0/1/2s retries could not bridge that interval.
RETRY_DELAYS = (2, 4, 8, 16, 32, 64)
RETRY_STATUS = frozenset((408, 429, 500, 502, 503, 504))

def read_bytes(url, *, opener=urllib.request.urlopen, sleeper=time.sleep,
               delays=RETRY_DELAYS, timeout=45):
    """Retry transient transport/HTTP failures, never turn errors into empty data."""
    for attempt in range(len(delays)+1):
        try:
            with opener(url, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code not in RETRY_STATUS or attempt == len(delays):
                raise
        except (OSError, http.client.IncompleteRead):
            if attempt == len(delays):
                raise
        sleeper(delays[attempt])
