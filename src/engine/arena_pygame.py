"""pygame without a screen: the window of a pygame program as frames and as text, the same in the
browser (Pyodide) and at build time (CPython with pygame-ce of the same version).

The browser's run worker has no screen, and pygame's own window (SDL's video) can't start there, so
src/engine/arena.py installs this module before a program that uses pygame runs. It replaces the
parts of pygame that need a screen, a keyboard, a mouse or a clock:

- pygame.display.set_mode gives an ordinary Surface, the window. Each display.flip() or
  display.update() shows a frame: its picture (a PNG, made the same way on every platform) and its
  text, the drawing that made it ("the window as text": every fill, blit and pygame.draw call on the
  window since the last time the whole window was filled).
- The program sees the events a test (or the learner, in the window panel) gives, each at the frame
  it happens: key presses and releases, mouse moves and clicks, and closing the window. A run shows
  at most `frames` frames: then the window is closed (a QUIT event), as a learner would close it,
  and a program that keeps drawing after that is stopped.
- Time is counted, not waited for: Clock.tick(60) moves the clock on by a 60th of a second at once,
  so an animation runs as fast as the computer can draw it, the same on every run.
- Sound is silent, and pygame.init() starts only the parts that work without a screen (fonts).

The pictures are for showing. Tests compare the text: text is drawn with FreeType, whose version
(and so the exact pixels of letters) differs between the two platforms, but the text is the same.
"""

import os
import random
import struct
import sys
import zlib

# pygame prints a greeting when it's imported; the program's output shouldn't start with it.
os.environ["PYGAME_HIDE_SUPPORT_PROMPT"] = "1"
import pygame  # noqa: E402
import pygame.sysfont  # noqa: E402

DEFAULT_SIZE = (640, 480)
MAX_SIDE = 1600
# The most lines one frame's text keeps (the newest); a program that draws thousands of shapes gets a count of the rest.
LOG_LIMIT = 300


class WindowClosed(BaseException):
    """Stops a program that kept drawing after its window was closed (a BaseException, so `except Exception` can't catch it)."""


def _n(v):
    """A number as the text shows it: whole numbers without a point, others to two decimals."""
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, float):
        if v.is_integer():
            return str(int(v))
        return repr(round(v, 2))
    try:
        return str(int(v))
    except (TypeError, ValueError):
        return repr(v)


def _point(p):
    try:
        x, y = p
        return f"({_n(x)}, {_n(y)})"
    except (TypeError, ValueError):
        return repr(p)


def _rect(r):
    try:
        r = pygame.Rect(r)
        return f"({r.x}, {r.y}, {r.w}, {r.h})"
    except (TypeError, ValueError):
        return repr(r)


def _color(c):
    try:
        if isinstance(c, (tuple, list)) and len(c) in (3, 4):
            col = pygame.Color(*c)
        else:
            col = pygame.Color(c)
    except (TypeError, ValueError):
        return repr(c)
    return f"({col.r}, {col.g}, {col.b})" if col.a == 255 else f"({col.r}, {col.g}, {col.b}, {col.a})"


def _png(surface):
    """The surface as a PNG (RGB), made with zlib so that both platforms give the same bytes."""
    w, h = surface.get_size()
    raw = pygame.image.tobytes(surface, "RGB")
    stride = w * 3
    rows = b"".join(b"\x00" + raw[y * stride:(y + 1) * stride] for y in range(h))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 6)) + chunk(b"IEND", b"")


_ORIGINAL = {}


def _original(owner, name):
    key = (owner.__name__, name)
    if key not in _ORIGINAL:
        _ORIGINAL[key] = (owner, getattr(owner, name, None))
    return _ORIGINAL[key][1]


def _set(owner, name, value):
    _original(owner, name)
    setattr(owner, name, value)


def _restore():
    for (_, name), (owner, value) in _ORIGINAL.items():
        if value is None:
            if hasattr(owner, name):
                delattr(owner, name)
        else:
            setattr(owner, name, value)


_BaseSurface = pygame.Surface


class ArenaSurface(_BaseSurface):
    """A Surface that knows what it shows (robot.png, text "Score: 3") and draws on the window as text too.

    convert() and convert_alpha() give a copy: there is no screen whose format they could match.
    """

    _arena_label = None

    def convert(self, *args):
        return self.copy()

    def convert_alpha(self, *args):
        return self.copy()

    def copy(self):
        new = _BaseSurface.copy(self)
        new._arena_label = self._arena_label
        return new

    def fill(self, color, rect=None, special_flags=0):
        r = _BaseSurface.fill(self, color, rect, special_flags)
        win = _WINDOW
        if win is not None and self is win.surface:
            whole = rect is None or pygame.Rect(rect).contains(self.get_rect())
            win.note(f"fill {_color(color)}" + ("" if rect is None else f" in {_rect(rect)}"), clear=whole and not special_flags)
        return r

    def blit(self, source, dest=(0, 0), area=None, special_flags=0):
        r = _BaseSurface.blit(self, source, dest, area, special_flags)
        win = _WINDOW
        if win is not None and self is win.surface:
            win.note_blit(source, dest, area, special_flags, r)
        return r

    def blits(self, blit_sequence, doreturn=1):
        rects = [self.blit(*item) for item in blit_sequence]
        return rects if doreturn else None

    def fblits(self, blit_sequence, special_flags=0):
        for item in blit_sequence:
            self.blit(item[0], item[1], None, special_flags)

    def set_at(self, pos, color):
        _BaseSurface.set_at(self, pos, color)
        win = _WINDOW
        if win is not None and self is win.surface:
            win.note(f"pixel {_color(color)} at {_point(pos)}")


def _label(surface):
    label = getattr(surface, "_arena_label", None)
    if label:
        return label
    w, h = surface.get_size()
    return f"a {w}x{h} surface"


def _adopt(surface, label):
    """The surface as an ArenaSurface (a copy of its pixels), labelled."""
    if not isinstance(surface, _BaseSurface):
        return surface
    if isinstance(surface, ArenaSurface):
        new = surface
    else:
        new = ArenaSurface(surface.get_size(), surface.get_flags() & pygame.SRCALPHA, surface)
        if surface.get_bitsize() == 8:
            new.set_palette(surface.get_palette())
        raw = surface.get_buffer().raw
        row = surface.get_width() * surface.get_bytesize()
        sp, dp = surface.get_pitch(), new.get_pitch()
        buf = new.get_buffer()
        if sp == dp:
            buf.write(raw)
        else:
            for y in range(surface.get_height()):
                buf.write(raw[y * sp:y * sp + row], y * dp)
        key = surface.get_colorkey()
        if key is not None:
            new.set_colorkey(key)
        alpha = surface.get_alpha()
        if alpha is not None and not surface.get_flags() & pygame.SRCALPHA:
            new.set_alpha(alpha)
    new._arena_label = label
    return new


class _Pressed:
    """pygame.key.get_pressed()'s answer: pressed[pygame.K_LEFT] is True while the key is held."""

    def __init__(self, held):
        self._held = frozenset(held)

    def __getitem__(self, key):
        return key in self._held

    def __len__(self):
        return 512

    def __iter__(self):
        return (i in self._held for i in range(512))

    def __repr__(self):
        return f"<pressed keys: {', '.join(sorted(pygame.key.name(k) or str(k) for k in self._held)) or 'none'}>"


_WINDOW = None


def _video_error():
    return pygame.error("video system not initialized")


class Window:
    """One run's window: its events, its frames and its text.

    spec: {"frames": int (how many frames it may show, default 60), "events": [event, ...],
           "png": "all" | "last" | "none" (which frames get a picture; default "all"),
           "pngFrom": int (with "all": pictures only from this frame on, for frames the page hasn't shown yet),
           "seed": int (for random, so that every run of a session goes the same way; default 1)}
    An event: {"at": frames shown before it happens, "type": "keydown" | "keyup" | "mousedown" |
               "mouseup" | "mousemove" | "quit", "key": "K_LEFT" (keys), "pos": [x, y] and "button": 1
               (mouse), "unicode": "a" (optional, keys)}.
    emit(frame): gets each frame as it's shown: {"index", "log", "png" (bytes or None), "title", "ms" (the
    counted clock's time, in milliseconds: when the frame should show, for playing them back)}.
    """

    def __init__(self, spec, emit):
        spec = spec or {}
        self.budget = max(1, int(spec.get("frames") or 60))
        self.png_mode = spec.get("png") or "all"
        self.png_from = int(spec.get("pngFrom") or 1)
        self.seed = spec.get("seed", 1)
        self.emit = emit
        self.pending = sorted(enumerate(spec.get("events") or []), key=lambda e: (int(e[1].get("at") or 0), e[0]))
        self.pending = [e for _, e in self.pending]
        self.queue = []
        self.surface = None
        self.title = "pygame window"
        self.shown = 0
        self.log = []
        self.dropped = 0
        self.last_log = ""
        self.last_picture = None
        self.held = set()
        self.mouse = (0, 0)
        self.mouse_rel = (0, 0)
        self.buttons = [False, False, False, False, False]
        self.quit_sent = False
        self.closed = False
        self.video = False
        self.ended = "program"
        self.now = 0.0
        self.timers = []

    # ---------------------------------------------------------------- the text

    def note(self, line, clear=False):
        if clear:
            self.log = []
            self.dropped = 0
        self.log.append(line)
        if len(self.log) > LOG_LIMIT:
            del self.log[0]
            self.dropped += 1

    def note_blit(self, source, dest, area, special_flags, rect):
        try:
            if isinstance(dest, pygame.Rect) or (hasattr(dest, "__len__") and len(dest) == 4):
                where = pygame.Rect(dest).topleft
            else:
                x, y = dest
                where = (int(x), int(y))
        except (TypeError, ValueError):
            where = (rect.x, rect.y)
        line = f"blit {_label(source)} at {_point(where)}"
        if area is not None:
            line += f" (part {_rect(area)})"
        win_rect = self.surface.get_rect()
        opaque = not source.get_flags() & pygame.SRCALPHA and source.get_colorkey() is None and source.get_alpha() in (None, 255)
        whole = area is None and not special_flags and opaque and pygame.Rect(where, source.get_size()).contains(win_rect)
        self.note(line, clear=whole)

    def text(self):
        lines = ([f"(and {self.dropped} earlier drawing steps)"] if self.dropped else []) + self.log
        return "\n".join(lines)

    # ---------------------------------------------------------------- frames

    def show(self):
        if not self.video or self.surface is None:
            raise _video_error()
        if self.shown >= self.budget:
            # The window was closed after its last frame; the program draws on regardless.
            self.ended = "stopped"
            raise WindowClosed()
        self.shown += 1
        text = self.text()
        self.last_log = text
        picture = None
        if self.png_mode == "all" and self.shown >= self.png_from:
            picture = _png(self.surface)
            self.last_picture = None
        elif self.png_mode != "none":
            self.last_picture = (self.shown, self.surface.copy())
        self.emit({"index": self.shown, "log": text, "png": picture, "title": self.title, "ms": int(self.now)})

    def finish(self):
        """What the window ended as; the last frame gets its picture now if it didn't have one."""
        if self.last_picture is not None:
            index, surface = self.last_picture
            self.emit({"index": index, "log": self.last_log, "png": _png(surface), "title": self.title, "ms": int(self.now), "again": True})
        if self.ended == "program" and self.quit_sent:
            self.ended = "closed"
        size = list(self.surface.get_size()) if self.surface is not None else None
        return {"frames": self.shown, "budget": self.budget, "size": size, "title": self.title, "ended": self.ended, "log": self.last_log}

    # ---------------------------------------------------------------- events

    def _event(self, e):
        kind = (e.get("type") or "").lower()
        if kind in ("keydown", "keyup"):
            name = e.get("key") or ""
            key = getattr(pygame, name, None) if name.startswith("K_") else None
            if key is None:
                try:
                    key = pygame.key.key_code(name)
                except (ValueError, pygame.error):
                    return None
            if kind == "keydown":
                self.held.add(key)
            else:
                self.held.discard(key)
            mods = self._mods()
            uni = e.get("unicode")
            if uni is None:
                uni = chr(key) if 32 <= key < 127 else ("\r" if key == pygame.K_RETURN else "")
                if uni.isalpha() and mods & pygame.KMOD_SHIFT:
                    uni = uni.upper()
            attrs = {"key": key, "mod": mods, "scancode": 0, "unicode": uni if kind == "keydown" else ""}
            if kind == "keyup":
                del attrs["unicode"]
            return pygame.event.Event(pygame.KEYDOWN if kind == "keydown" else pygame.KEYUP, attrs)
        if kind in ("mousedown", "mouseup", "mousemove"):
            pos = tuple(int(v) for v in (e.get("pos") or self.mouse))
            rel = (pos[0] - self.mouse[0], pos[1] - self.mouse[1])
            self.mouse_rel = (self.mouse_rel[0] + rel[0], self.mouse_rel[1] + rel[1])
            self.mouse = pos
            if kind == "mousemove":
                return pygame.event.Event(pygame.MOUSEMOTION, {"pos": pos, "rel": rel, "buttons": tuple(self.buttons[:3]), "touch": False})
            button = int(e.get("button") or 1)
            if 1 <= button <= 5:
                self.buttons[button - 1] = kind == "mousedown"
            return pygame.event.Event(pygame.MOUSEBUTTONDOWN if kind == "mousedown" else pygame.MOUSEBUTTONUP, {"pos": pos, "button": button, "touch": False})
        if kind == "quit":
            self.quit_sent = True
            return pygame.event.Event(pygame.QUIT)
        return None

    def _mods(self):
        mods = 0
        for key, mod in ((pygame.K_LSHIFT, pygame.KMOD_LSHIFT), (pygame.K_RSHIFT, pygame.KMOD_RSHIFT), (pygame.K_LCTRL, pygame.KMOD_LCTRL), (pygame.K_RCTRL, pygame.KMOD_RCTRL), (pygame.K_LALT, pygame.KMOD_LALT), (pygame.K_RALT, pygame.KMOD_RALT)):
            if key in self.held:
                mods |= mod
        return mods

    def pump(self):
        if not self.video:
            raise _video_error()
        while self.pending and int(self.pending[0].get("at") or 0) <= self.shown:
            ev = self._event(self.pending.pop(0))
            if ev is not None:
                self.queue.append(ev)
        for t in self.timers:
            while t["due"] <= self.now and t["loops"] != 0:
                self.queue.append(t["event"])
                t["due"] += t["every"]
                if t["loops"] > 0:
                    t["loops"] -= 1
        self.timers = [t for t in self.timers if t["loops"] != 0]
        # Every frame the window may show has been shown: the learner closes it.
        if self.shown >= self.budget and not self.quit_sent:
            self.quit_sent = True
            self.queue.append(pygame.event.Event(pygame.QUIT))

    @staticmethod
    def _types(eventtype):
        if eventtype is None:
            return None
        if isinstance(eventtype, int):
            return {eventtype}
        return set(eventtype)

    def get(self, eventtype=None, pump=True, exclude=None):
        if pump:
            self.pump()
        elif not self.video:
            raise _video_error()
        want = self._types(eventtype)
        skip = self._types(exclude) or set()
        taken = [e for e in self.queue if (want is None or e.type in want) and e.type not in skip]
        self.queue = [e for e in self.queue if not ((want is None or e.type in want) and e.type not in skip)]
        return taken

    def poll(self):
        self.pump()
        return self.queue.pop(0) if self.queue else pygame.event.Event(pygame.NOEVENT)

    def wait(self, timeout=0):
        self.pump()
        if not self.queue and self.pending:
            # Nothing happens until the next event: the program waits for it, so it comes now.
            ev = self._event(self.pending.pop(0))
            if ev is not None:
                self.queue.append(ev)
        if not self.queue:
            if timeout:
                self.now += timeout
                return pygame.event.Event(pygame.NOEVENT)
            # No more events will come: the learner closes the window.
            self.quit_sent = True
            return pygame.event.Event(pygame.QUIT)
        return self.queue.pop(0)

    def peek(self, eventtype=None, pump=True):
        if pump:
            self.pump()
        want = self._types(eventtype)
        if want is None:
            return self.queue[0] if self.queue else pygame.event.Event(pygame.NOEVENT)
        return any(e.type in want for e in self.queue)

    def clear(self, eventtype=None, pump=True):
        if pump:
            self.pump()
        want = self._types(eventtype)
        self.queue = [e for e in self.queue if want is not None and e.type not in want]

    def post(self, event):
        if not self.video:
            raise _video_error()
        self.queue.append(event)
        return True

    def set_timer(self, event, millis, loops=0):
        if isinstance(event, int):
            event = pygame.event.Event(event)
        self.timers = [t for t in self.timers if t["event"].type != event.type]
        if millis > 0:
            self.timers.append({"event": event, "every": millis, "due": self.now + millis, "loops": loops if loops > 0 else -1})

    # ---------------------------------------------------------------- the display

    def set_mode(self, size=(0, 0), flags=0, depth=0, display=0, vsync=0):
        self.video = True
        try:
            w, h = (int(v) for v in size)
        except (TypeError, ValueError):
            raise TypeError("size must be two numbers") from None
        if w < 0 or h < 0:
            raise pygame.error("Cannot set negative sized display mode")
        if w == 0 or h == 0:
            w, h = DEFAULT_SIZE
        w, h = min(w, MAX_SIDE), min(h, MAX_SIDE)
        self.surface = ArenaSurface((w, h))
        self.surface._arena_label = "the window"
        self.log = []
        self.dropped = 0
        return self.surface

    def get_surface(self):
        return self.surface if self.video else None

    def set_caption(self, title, icontitle=None):
        self.title = str(title)

    def get_caption(self):
        return (self.title, self.title)

    def quit_display(self):
        self.video = False
        self.surface = None


def _install(win):
    """Replaces pygame's screen, keyboard, mouse, clock and sound with the window's."""
    disp, ev, key, mouse, time_ = pygame.display, pygame.event, pygame.key, pygame.mouse, pygame.time

    def init():
        win.video = True
        pygame.font.init()
        return (6, 0)

    def quit_():
        win.quit_display()
        pygame.font.quit()

    _set(pygame, "init", init)
    _set(pygame, "quit", quit_)
    _set(pygame, "Surface", ArenaSurface)

    def flip():
        win.show()

    def update(*args, **kwargs):
        win.show()

    class Info:
        def __init__(self):
            self.current_w, self.current_h = win.surface.get_size() if win.surface is not None else (-1, -1)
            self.hw = False
            self.wm = True
            self.bitsize = 32
            self.bytesize = 4

    def display_init():
        win.video = True

    for name, value in {
        "set_mode": win.set_mode,
        "get_surface": win.get_surface,
        "flip": flip,
        "update": update,
        "set_caption": win.set_caption,
        "get_caption": win.get_caption,
        "init": display_init,
        "quit": win.quit_display,
        "get_init": lambda: win.video,
        "get_active": lambda: win.video,
        "Info": Info,
        "set_icon": lambda surface: None,
        "iconify": lambda: False,
        "toggle_fullscreen": lambda: 0,
        "get_window_size": lambda: win.surface.get_size() if win.surface is not None else (0, 0),
        "get_desktop_sizes": lambda: [(1920, 1080)],
        "list_modes": lambda *a, **k: [(1920, 1080)],
        "mode_ok": lambda *a, **k: 32,
        "get_driver": lambda: "arena",
        "get_wm_info": lambda: {},
        "set_allow_screensaver": lambda *a: None,
        "get_num_displays": lambda: 1,
    }.items():
        _set(disp, name, value)

    for name, value in {
        "get": win.get,
        "poll": win.poll,
        "wait": win.wait,
        "peek": win.peek,
        "clear": win.clear,
        "post": win.post,
        "pump": win.pump,
        "set_allowed": lambda *a: None,
        "set_blocked": lambda *a: None,
        "get_blocked": lambda *a: False,
        "set_grab": lambda *a: None,
        "get_grab": lambda: False,
        "set_keyboard_grab": lambda *a: None,
        "get_keyboard_grab": lambda: False,
    }.items():
        _set(ev, name, value)

    def get_pressed():
        win.pump()
        return _Pressed(win.held)

    for name, value in {
        "get_pressed": get_pressed,
        "get_mods": win._mods,
        "set_mods": lambda m: None,
        "set_repeat": lambda *a: None,
        "get_repeat": lambda: (0, 0),
        "get_focused": lambda: win.video,
        "start_text_input": lambda: None,
        "stop_text_input": lambda: None,
        "set_text_input_rect": lambda r: None,
    }.items():
        _set(key, name, value)

    def get_pos():
        win.pump()
        return win.mouse

    def get_rel():
        win.pump()
        rel, win.mouse_rel = win.mouse_rel, (0, 0)
        return rel

    def get_mouse_pressed(num_buttons=3):
        win.pump()
        return tuple(win.buttons[:5 if num_buttons == 5 else 3])

    def set_pos(*pos):
        p = pos[0] if len(pos) == 1 else pos
        win.mouse = (int(p[0]), int(p[1]))

    visible = {"on": True}

    def set_visible(on):
        was, visible["on"] = visible["on"], bool(on)
        return was

    for name, value in {
        "get_pos": get_pos,
        "get_rel": get_rel,
        "get_pressed": get_mouse_pressed,
        "set_pos": set_pos,
        "set_visible": set_visible,
        "get_visible": lambda: visible["on"],
        "get_focused": lambda: win.video,
        "set_cursor": lambda *a, **k: None,
        "get_cursor": lambda: None,
    }.items():
        _set(mouse, name, value)

    class Clock:
        """pygame.time.Clock on a counted clock: tick(60) moves it on by a 60th of a second, at once."""

        def __init__(self):
            self._last = win.now
            self._time = 0
            self._times = []

        def tick(self, framerate=0):
            if framerate and framerate > 0:
                win.now = max(win.now, self._last + 1000 / framerate)
            elapsed = win.now - self._last
            self._last = win.now
            self._time = int(elapsed)
            self._times = (self._times + [elapsed])[-10:]
            return self._time

        tick_busy_loop = tick

        def get_time(self):
            return self._time

        def get_rawtime(self):
            return self._time

        def get_fps(self):
            total = sum(self._times)
            return 1000 * len(self._times) / total if total else 0.0

    def wait(ms):
        win.now += max(0, int(ms))
        return max(0, int(ms))

    _set(pygame, "Clock", Clock)
    for name, value in {"Clock": Clock, "get_ticks": lambda: int(win.now), "wait": wait, "delay": wait, "set_timer": win.set_timer}.items():
        _set(time_, name, value)

    # Fonts: what each text shows is known by the surfaces it makes.
    BaseFont = _original(pygame.font, "Font")

    class Font(BaseFont):
        def render(self, text, antialias, color, bgcolor=None, wraplength=0):
            if bgcolor is None:
                surface = BaseFont.render(self, text, antialias, color, None, wraplength)
            else:
                surface = BaseFont.render(self, text, antialias, color, bgcolor, wraplength)
            return _adopt(surface, f'text "{text}"')

    _set(pygame.font, "Font", Font)
    _set(pygame, "Font", Font)
    _set(pygame.sysfont, "Font", Font)

    # Every font is pygame's own (freesansbold.ttf): the browser has no others, and a font found on one
    # computer but not on another would make a program look different on each.
    def SysFont(name, size, bold=False, italic=False, constructor=None):
        font = Font(None, size)
        font.set_bold(bool(bold))
        font.set_italic(bool(italic))
        return font

    _set(pygame.font, "SysFont", SysFont)
    _set(pygame.sysfont, "SysFont", SysFont)
    _set(pygame.font, "get_fonts", lambda: [])
    _set(pygame.sysfont, "get_fonts", lambda: [])
    _set(pygame.font, "match_font", lambda *a, **k: None)
    _set(pygame.sysfont, "match_font", lambda *a, **k: None)

    # Images: a loaded image is named after its file.
    load = _original(pygame.image, "load")

    def image_load(file, namehint=""):
        surface = load(file, namehint) if namehint else load(file)
        name = file if isinstance(file, str) else (namehint or "an image")
        return _adopt(surface, str(name).replace("\\", "/").rsplit("/", 1)[-1])

    _set(pygame.image, "load", image_load)
    if hasattr(pygame.image, "load_extended"):
        _set(pygame.image, "load_extended", image_load)

    def transform(name, describe):
        original = _original(pygame.transform, name)

        def wrapped(surface, *args, **kwargs):
            result = original(surface, *args, **kwargs)
            if isinstance(result, _BaseSurface) and result is not kwargs.get("dest_surface"):
                result = _adopt(result, describe(_label(surface), result, args))
            return result

        wrapped.__name__ = name
        wrapped.__doc__ = original.__doc__
        _set(pygame.transform, name, wrapped)

    size = lambda s: f"{s.get_width()}x{s.get_height()}"
    for name, describe in {
        "rotate": lambda label, r, a: f"{label} rotated {_n(a[0]) if a else '?'}",
        "rotozoom": lambda label, r, a: f"{label} rotated {_n(a[0]) if a else '?'} and scaled to {size(r)}",
        "flip": lambda label, r, a: f"{label} flipped" + ("" if not a else " " + " and ".join(w for w, on in (("left to right", a[0]), ("upside down", len(a) > 1 and a[1])) if on)),
        "scale": lambda label, r, a: f"{label} scaled to {size(r)}",
        "scale_by": lambda label, r, a: f"{label} scaled to {size(r)}",
        "smoothscale": lambda label, r, a: f"{label} scaled to {size(r)}",
        "smoothscale_by": lambda label, r, a: f"{label} scaled to {size(r)}",
        "scale2x": lambda label, r, a: f"{label} scaled to {size(r)}",
        "chop": lambda label, r, a: f"{label} chopped to {size(r)}",
        "grayscale": lambda label, r, a: f"{label} in gray",
        "invert": lambda label, r, a: f"{label} inverted",
    }.items():
        if hasattr(pygame.transform, name):
            transform(name, describe)

    # pygame.draw on the window: each shape is a line of the window's text.
    def draw(name, names, describe):
        original = _original(pygame.draw, name)

        def wrapped(*args, **kwargs):
            r = original(*args, **kwargs)
            bound = dict(zip(names, args))
            bound.update(kwargs)
            if win.surface is not None and bound.get("surface") is win.surface:
                try:
                    win.note(describe(bound))
                except Exception:  # noqa: BLE001 - the text never stops a program that pygame accepted
                    win.note(f"{name} {_color(bound.get('color'))}")
            return r

        wrapped.__name__ = name
        wrapped.__doc__ = original.__doc__
        _set(pygame.draw, name, wrapped)

    def width(b, default):
        w = b.get("width", default)
        return "" if w == default else (" filled" if w == 0 else f", width {_n(w)}")

    def outline(b):
        w = b.get("width", 0)
        return "" if w == 0 else f", width {_n(w)}"

    def points(ps):
        return ", ".join(_point(p) for p in ps)

    draw("rect", ["surface", "color", "rect", "width", "border_radius"], lambda b: f"rect {_color(b['color'])} {_rect(b['rect'])}{outline(b)}" + (f", corners {_n(b['border_radius'])}" if b.get("border_radius", 0) > 0 else ""))
    draw("circle", ["surface", "color", "center", "radius", "width"], lambda b: f"circle {_color(b['color'])} at {_point(b['center'])} radius {_n(b['radius'])}{outline(b)}")
    draw("ellipse", ["surface", "color", "rect", "width"], lambda b: f"ellipse {_color(b['color'])} {_rect(b['rect'])}{outline(b)}")
    draw("polygon", ["surface", "color", "points", "width"], lambda b: f"polygon {_color(b['color'])} through {points(b['points'])}{outline(b)}")
    draw("line", ["surface", "color", "start_pos", "end_pos", "width"], lambda b: f"line {_color(b['color'])} from {_point(b['start_pos'])} to {_point(b['end_pos'])}{width(b, 1)}")
    draw("lines", ["surface", "color", "closed", "points", "width"], lambda b: f"lines {_color(b['color'])} {'closed' if b['closed'] else 'open'} through {points(b['points'])}{width(b, 1)}")
    draw("aaline", ["surface", "color", "start_pos", "end_pos"], lambda b: f"aaline {_color(b['color'])} from {_point(b['start_pos'])} to {_point(b['end_pos'])}")
    draw("aalines", ["surface", "color", "closed", "points"], lambda b: f"aalines {_color(b['color'])} {'closed' if b['closed'] else 'open'} through {points(b['points'])}")
    draw("arc", ["surface", "color", "rect", "start_angle", "stop_angle", "width"], lambda b: f"arc {_color(b['color'])} {_rect(b['rect'])} from {_n(b['start_angle'])} to {_n(b['stop_angle'])}{width(b, 1)}")

    # Sound: silent (there are no speakers to play it on, and the tests can't hear it).
    class Sound:
        def __init__(self, *args, **kwargs):
            self._volume = 1.0

        def play(self, *args, **kwargs):
            return None

        def stop(self):
            pass

        def fadeout(self, ms):
            pass

        def set_volume(self, value):
            self._volume = float(value)

        def get_volume(self):
            return self._volume

        def get_length(self):
            return 0.0

        def get_num_channels(self):
            return 0

    mixer = pygame.mixer
    for name, value in {
        "init": lambda *a, **k: None,
        "pre_init": lambda *a, **k: None,
        "quit": lambda: None,
        "get_init": lambda: (44100, -16, 2),
        "Sound": Sound,
        "stop": lambda: None,
        "pause": lambda: None,
        "unpause": lambda: None,
        "fadeout": lambda ms: None,
        "set_num_channels": lambda n: None,
        "get_num_channels": lambda: 8,
        "get_busy": lambda: False,
    }.items():
        _set(mixer, name, value)
    _set(pygame, "Sound", Sound)
    music = getattr(mixer, "music", None)
    if music is not None:
        for name in ("load", "unload", "play", "rewind", "stop", "pause", "unpause", "fadeout", "set_volume", "set_pos", "queue", "set_endevent"):
            _set(music, name, lambda *a, **k: None)
        _set(music, "get_busy", lambda: False)
        _set(music, "get_volume", lambda: 1.0)
        _set(music, "get_pos", lambda: -1)
        _set(music, "get_endevent", lambda: pygame.NOEVENT)

    joystick = pygame.joystick
    for name, value in {"init": lambda: None, "quit": lambda: None, "get_init": lambda: True, "get_count": lambda: 0}.items():
        _set(joystick, name, value)


def start(spec, emit):
    """Sets up the window for one run; returns it (finish() it after the run, then call stop())."""
    global _WINDOW
    win = Window(spec, emit)
    _WINDOW = win
    _install(win)
    random.seed(win.seed)
    return win


def stop():
    """Gives pygame back its own screen, keyboard, mouse, clock and sound."""
    global _WINDOW
    _WINDOW = None
    _restore()
    try:
        pygame.font.quit()
    except Exception:  # noqa: BLE001
        pass


__all__ = ["ArenaSurface", "Window", "WindowClosed", "start", "stop"]
