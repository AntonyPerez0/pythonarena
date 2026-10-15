# Images for the pygame lessons

The images a pygame program can load on Python Arena: `pygame.image.load("robot.png")` in a challenge that lists it in `assets`, in a lesson example after an ` ```asset robot.png ` block, or in the Playground (every image is in a pygame program's folder there). The build publishes them at `images/`.

| Image | Size | What |
|---|---|---|
| `robot.png` | 40 x 40 | a robot, blue and yellow |
| `coin.png` | 24 x 24 | a gold coin |
| `ball.png` | 28 x 28 | a red ball |
| `monster.png` | 40 x 40 | a green monster |
| `floor.png`, `wall.png`, `box.png`, `target.png`, `box-done.png` | 40 x 40 | tiles for a box-pushing puzzle: floor, brick wall, crate, target, crate on its target |

They are Python Arena's own pixel art (not the MOOC's images), drawn by [`scripts/make-sprites.mjs`](../../scripts/make-sprites.mjs) from rows of letters, one letter per pixel. To change one, edit its rows there and run `node scripts/make-sprites.mjs`. Like the rest of `content/`, they are licensed CC BY-NC-SA 4.0.
