// Share cards: a 1200x630 image (the size social sites use for link previews) drawn on a canvas,
// shared with the phone's share sheet or downloaded.
export type Card = { kicker: string; title: string; lines: string[]; file: string };

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export async function drawCard(card: Card): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const ctx = c.getContext("2d")!;
  const font = '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  await Promise.all([document.fonts.load('700 40px "Inter Variable"'), document.fonts.load('800 68px "Inter Variable"')]).catch(() => {});
  // The site's dark theme: its page color, a blue glow on the right and a faint yellow one in the
  // top-left corner, like the home page's hero.
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, 1200, 630);
  const glow = ctx.createRadialGradient(1000, 150, 0, 1000, 150, 620);
  glow.addColorStop(0, "rgba(55, 118, 171, 0.28)");
  glow.addColorStop(1, "rgba(55, 118, 171, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1200, 630);
  const glowYellow = ctx.createRadialGradient(0, 0, 0, 0, 0, 460);
  glowYellow.addColorStop(0, "rgba(255, 212, 59, 0.12)");
  glowYellow.addColorStop(1, "rgba(255, 212, 59, 0)");
  ctx.fillStyle = glowYellow;
  ctx.fillRect(0, 0, 1200, 630);

  // The logo (public/favicon.svg), at twice its 32 px size: the blue tile and the yellow >>> prompt.
  ctx.save();
  ctx.translate(80, 72);
  ctx.scale(2, 2);
  ctx.fillStyle = "#3776AB";
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 8);
  ctx.fill();
  ctx.strokeStyle = "#FFD43B";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2.9;
  ctx.stroke(new Path2D("M6.5 10.5 11.5 16l-5 5.5M12.5 10.5l5 5.5-5 5.5M18.5 10.5l5 5.5-5 5.5"));
  ctx.restore();
  ctx.fillStyle = "#f4f4f5";
  ctx.font = `700 40px ${font}`;
  ctx.fillText("Python Arena", 166, 118);

  ctx.fillStyle = "#ffd43b";
  ctx.font = `700 28px ${font}`;
  ctx.fillText(card.kicker.toUpperCase(), 80, 240);
  ctx.fillStyle = "#fafafa";
  ctx.font = `750 68px ${font}`;
  const title = wrap(ctx, card.title, 1040).slice(0, 2);
  title.forEach((l, i) => ctx.fillText(l, 80, 320 + i * 78));
  ctx.fillStyle = "#d4d4d8";
  ctx.font = `500 32px ${font}`;
  card.lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, 80, 320 + title.length * 78 + 20 + i * 46));
  ctx.fillStyle = "#a1a1aa";
  ctx.font = `600 30px ${font}`;
  ctx.fillText("Python Arena  ·  learn Python with the real Python, free", 80, 580);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The image couldn't be drawn"))), "image/png"));
}

/** Shares the card (the phone's share sheet) or downloads it. */
export async function shareCard(card: Card, text: string): Promise<"shared" | "downloaded"> {
  const blob = await drawCard(card);
  const file = new File([blob], card.file, { type: "image/png" });
  const url = location.origin + import.meta.env.BASE_URL;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `${text} ${url}` });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "shared";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = card.file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return "downloaded";
}
