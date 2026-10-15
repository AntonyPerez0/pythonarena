# Third-party notices

Python Arena's own code is MIT licensed (see [LICENSE](LICENSE) for its scope). The site also serves the following third-party components, which keep their own licenses.

## Python in the browser (downloaded by the browser from this site)

`public/engine/` is copied by `scripts/copy-engine.mjs` from the [`pyodide`](https://www.npmjs.com/package/pyodide) npm package, at the exact version pinned in `package.json`, unchanged (the build also writes gzip copies of some files). The license texts, `Pyodide-MPL-2.0.txt` and CPython's `CPython-LICENSE.txt` (from the tag of the Python version Pyodide runs), are kept in `engine-licenses/` and published with the engine, at `engine/licenses/`.

| Component | Where it is | License |
|---|---|---|
| [Pyodide](https://github.com/pyodide/pyodide) (the loader and the WebAssembly build) | `pyodide.mjs`, `pyodide.asm.mjs`, `pyodide.asm.wasm`, `pyodide-lock.json` | Mozilla Public License 2.0 |
| [CPython](https://github.com/python/cpython), the Python interpreter and its standard library, compiled by Pyodide | `pyodide.asm.wasm`, `python_stdlib.zip` | Python Software Foundation License Version 2 (with parts under their own permissive licenses, listed in CPython's `LICENSE` file) |
| Libraries built into CPython by Pyodide (such as zlib, bzip2, libffi, SQLite, OpenSSL's hashing) | `pyodide.asm.wasm` | Their own permissive licenses (zlib, bzip2, MIT, public domain, Apache-2.0) |
| [Emscripten](https://github.com/emscripten-core/emscripten) runtime, generated into the module | `pyodide.asm.mjs`, `pyodide.asm.wasm` | MIT or University of Illinois/NCSA |

Pyodide's source code, at the same version, is at https://github.com/pyodide/pyodide (the release tag named after the version in `package.json`), and CPython's at https://github.com/python/cpython (the tag of the Python version Pyodide names in `pyodide-lock.json`). The MPL 2.0 covers Pyodide's own files, which Python Arena serves unchanged.

## pygame (downloaded by the browser only for a program that uses it)

`engine-packages/pygame_ce-2.5.7-cp314-cp314-pyemscripten_2026_0_wasm32.whl` is Pyodide's build of [pygame-ce](https://github.com/pygame-community/pygame-ce) 2.5.7, unchanged: the file Pyodide publishes for this version (its SHA-256 is the one in `pyodide-lock.json`, which `scripts/copy-engine.mjs` checks). The site serves it at `engine/`, and a browser downloads it the first time a program imports pygame. Its license text, `pygame-ce-LGPL-2.1.txt`, is in `engine-licenses/` and published at `engine/licenses/`.

| Component | Where it is | License |
|---|---|---|
| pygame-ce 2.5.7 | the wheel | GNU Lesser General Public License 2.1 or later |
| [SDL 2](https://www.libsdl.org), SDL_ttf, SDL_image | the wheel and `pyodide.asm.wasm` | zlib license |
| [FreeType](https://freetype.org) (draws text) | the wheel | The FreeType Project License: portions of this software are copyright © The FreeType Project (www.freetype.org). All rights reserved. |
| libpng, zlib, libjpeg (reads images) | the wheel | libpng license, zlib license; this software is based in part on the work of the Independent JPEG Group |
| `freesansbold.ttf`, pygame's default font ([GNU FreeFont](https://www.gnu.org/software/freefont/)) | the wheel | GNU General Public License 3 with the font exception |

pygame-ce's source code, at the same version, is at https://github.com/pygame-community/pygame-ce (the tag `2.5.7`), and Pyodide's recipe that builds it at https://github.com/pyodide/pyodide (the release tag named after the version in `package.json`). Python Arena runs pygame without a screen (its own module, `src/engine/arena_pygame.py`, replaces pygame's window, keyboard, mouse, clock and sound while a program runs); it doesn't change pygame's files, and you can use another build of pygame-ce in their place.

## Libraries and fonts in the site's pages

The site's pages are built with these npm packages (and their small dependencies). The build writes every package's license text to `licenses/npm-packages.txt`, which is published with the site.

| Component | License |
|---|---|
| [React](https://react.dev) and React DOM 18 | MIT |
| [React Router](https://reactrouter.com) 6 | MIT |
| [CodeMirror](https://codemirror.net) 6 (the code editor, with its Python mode and the One Dark theme) and [Lezer](https://lezer.codemirror.net) | MIT |
| [@uiw/react-codemirror](https://github.com/uiwjs/react-codemirror) | MIT |
| [marked](https://marked.js.org) (lesson Markdown) | MIT |
| [Lucide](https://lucide.dev) icons (`lucide-react`) | ISC |
| [uqr](https://github.com/unjs/uqr) (QR codes of transfer links; a port of Project Nayuki's QR Code generator) | MIT |
| [Inter](https://rsms.me/inter/) and [JetBrains Mono](https://www.jetbrains.com/lp/mono/) fonts, from [Fontsource](https://fontsource.org) | SIL Open Font License 1.1 |

The site's design and parts of its page code are adapted from [C/C++ Arena](https://cpparena.com), by the same author.

## Build and test tools

Vite (MIT) bundles the site and may add small runtime helpers to the published scripts, such as its module preload helper. TypeScript, the Vite React plugin, the `yaml` package, Playwright, axe-core and jsQR (Apache 2.0, reads the QR codes back in the tests) are used to build and test the site and are not part of the published pages.
