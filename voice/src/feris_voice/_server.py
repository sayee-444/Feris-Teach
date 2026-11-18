"""The voice service's control interface: HTTP on 127.0.0.1, for the teacher's toolbelt.

  POST /say     {"reply": "<text>"}: speak the reply's spoken version, after anything queued
  POST /stop    silence the voice at once, and say what was cut: the interruption
  POST /off     silence the voice and keep it silent
  POST /on      let the voice speak again
  GET  /status  whether the voice is on, what it is saying and what is queued

Only programs on this machine may use it: a request that comes from a site open in a browser
is refused, so that no page can make the voice speak.
"""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import cast, final, override

from feris_voice._speaker import Interruption, Speaker
from feris_voice._spoken import spoken_version

_BODY_LIMIT = 1024 * 1024
"""The most a request may weigh: a long reply is well under it."""


def _interruption(cut: Interruption) -> dict[str, object]:
    if not cut.cut:
        return {"cut": False}
    return {"cut": True, "lastHeard": cut.last_heard, "unheard": list(cut.unheard)}


@final
class VoiceServer(ThreadingHTTPServer):
    daemon_threads: bool = True

    def __init__(self, speaker: Speaker) -> None:
        super().__init__(("127.0.0.1", 0), _Handler)
        self.speaker = speaker

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server_address[1]}/"


@final
class _Handler(BaseHTTPRequestHandler):
    # The handler's server is always a VoiceServer, which the base class cannot know.
    server: VoiceServer  # pyright: ignore[reportIncompatibleVariableOverride]

    @override
    def log_message(self, format: str, *args: object) -> None:
        pass

    def _send(self, status: int, body: dict[str, object] | None = None) -> None:
        data = b"" if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        _ = self.wfile.write(data)

    def _is_own(self) -> bool:
        host = self.headers.get("Host", "")
        port = self.server.server_address[1]
        if host not in {f"127.0.0.1:{port}", f"localhost:{port}"}:
            return False
        origin = self.headers.get("Origin")
        return origin is None or origin == f"http://{host}"

    def _reply(self) -> str | None:
        """The reply in the body of a request to /say, or None when the body is not one."""
        length = int(self.headers.get("Content-Length") or 0)
        if length > _BODY_LIMIT:
            return None
        try:
            body = cast("object", json.loads(self.rfile.read(length).decode("utf-8")))
        except ValueError:
            return None
        if not isinstance(body, dict):
            return None
        reply = cast("dict[str, object]", body).get("reply")
        return reply if isinstance(reply, str) else None

    def do_GET(self) -> None:
        if not self._is_own():
            return self._send(403)
        if self.path != "/status":
            return self._send(404)
        status = self.server.speaker.status()
        return self._send(
            200, {"on": status.on, "speaking": status.speaking, "queued": list(status.queued)}
        )

    def do_POST(self) -> None:
        if not self._is_own():
            return self._send(403)
        speaker = self.server.speaker
        if self.path == "/say":
            reply = self._reply()
            if reply is None:
                return self._send(400)
            return self._send(200, {"on": speaker.say(spoken_version(reply))})
        if self.path == "/stop":
            return self._send(200, _interruption(speaker.stop()))
        if self.path == "/off":
            speaker.off()
            return self._send(200, {"on": False})
        if self.path == "/on":
            speaker.on()
            return self._send(200, {"on": True})
        return self._send(404)
