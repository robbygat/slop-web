const surface = Slop.create({ background: '#8ed8f8' });
const ctx = surface.ctx;

const gatePlan = [
  [2.2, 0.38],
  [4.3, 0.62],
  [6.4, 0.33],
  [8.5, 0.57],
  [10.6, 0.42],
];

let planeY;
let velocity;
let flightTime;
let score;
let started;
let over;
let won;
let announced = false;
let gates;

function reset() {
  planeY = 0.5;
  velocity = 0;
  flightTime = 0;
  score = 0;
  started = false;
  over = false;
  won = false;
  gates = gatePlan.map(([at, y]) => ({ at, y, passed: false }));
  Slop.score(0);
}

function finish(didWin) {
  if (over) return;
  over = true;
  won = didWin;
  Slop.haptic(didWin ? 'success' : 'heavy');
  Slop.tone(didWin ? 720 : 150, didWin ? 0.18 : 0.12, 0.06);
  Slop.finished(score);
}

function roundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawCloud(x, y, size, alpha = 0.72) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.28, Math.PI, 0);
  ctx.arc(x + size * 0.25, y - size * 0.13, size * 0.34, Math.PI, 0);
  ctx.arc(x + size * 0.56, y, size * 0.27, Math.PI, 0);
  ctx.lineTo(x + size * 0.83, y + size * 0.21);
  ctx.lineTo(x - size * 0.28, y + size * 0.21);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPlane(x, y, size, tilt) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = '#fffaf1';
  ctx.strokeStyle = '#172a46';
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.62, 0);
  ctx.lineTo(-size * 0.45, -size * 0.25);
  ctx.lineTo(-size * 0.18, 0);
  ctx.lineTo(-size * 0.45, size * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ff7657';
  ctx.beginPath();
  ctx.moveTo(size * 0.05, -size * 0.04);
  ctx.lineTo(-size * 0.27, -size * 0.66);
  ctx.lineTo(size * 0.31, -size * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2a78d1';
  ctx.beginPath();
  ctx.arc(size * 0.25, -size * 0.06, size * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGate(x, centerY, radius, passed) {
  ctx.save();
  ctx.strokeStyle = passed ? '#d7f3ff' : '#ffd447';
  ctx.lineWidth = Math.max(8, radius * 0.18);
  ctx.shadowColor = passed ? 'transparent' : '#b7711c88';
  ctx.shadowBlur = passed ? 0 : 12;
  ctx.beginPath();
  ctx.arc(x, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function centeredLabel(text, x, y, font, color = '#172a46') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

reset();
Slop.onRestart(reset);

Slop.loop(({ dt, time, width, height }) => {
  const held = Slop.input.down || Slop.input.keys.has('Space') ||
    Slop.input.keys.has('ArrowUp') || Slop.input.keys.has('KeyW');
  const intent = Slop.input.pressed || held;
  const planeX = Math.max(66, Math.min(width * 0.24, 180));
  const planeSize = Math.max(26, Math.min(width, height) * 0.08);
  const gateRadius = Math.max(46, Math.min(82, height * 0.12));
  const speed = Math.max(120, width * 0.31);
  const top = Math.max(52, Slop.safeArea.top * 0.58);
  const bottom = Math.max(40, Slop.safeArea.bottom * 0.55);
  const playHeight = height - top - bottom;

  if (intent && !started && !over) {
    started = true;
    Slop.haptic('light');
  }

  if (started && !over) {
    flightTime += dt;
    velocity += (held ? -1.55 : 0.92) * dt;
    velocity = Math.max(-0.72, Math.min(0.68, velocity));
    planeY += velocity * dt;

    const pixelY = top + planeY * playHeight;
    if (pixelY < top + planeSize * 0.42 || pixelY > height - bottom - planeSize * 0.42) {
      finish(false);
    }

    for (const gate of gates) {
      const previousX = planeX + (gate.at - (flightTime - dt)) * speed;
      const x = planeX + (gate.at - flightTime) * speed;
      if (!gate.passed && previousX > planeX && x <= planeX) {
        const gateY = top + gate.y * playHeight;
        if (Math.abs(pixelY - gateY) <= gateRadius * 0.72) {
          gate.passed = true;
          score += 100;
          Slop.score(score);
          Slop.haptic('light');
          Slop.tone(500 + score, 0.07, 0.035);
          if (gates.every(item => item.passed)) finish(true);
        } else {
          finish(false);
        }
      }
    }
  }

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#74cdf4');
  sky.addColorStop(0.72, '#c7effc');
  sky.addColorStop(1, '#fff3cb');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const drift = (time * 14) % (width + 220);
  drawCloud(width - drift, height * 0.2, 100);
  drawCloud((width * 0.55 - drift * 0.55 + width + 160) % (width + 160) - 80, height * 0.72, 76, 0.55);
  drawCloud((width * 0.15 - drift * 0.3 + width + 180) % (width + 180) - 90, height * 0.46, 58, 0.46);

  ctx.fillStyle = '#79bb65';
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= width + 80; x += 80) {
    ctx.quadraticCurveTo(x + 40, height - 22 - Math.sin((x + time * 22) * 0.015) * 10, x + 80, height - 12);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  for (const gate of gates) {
    const gateX = planeX + (gate.at - flightTime) * speed;
    if (gateX > -gateRadius && gateX < width + gateRadius) {
      drawGate(gateX, top + gate.y * playHeight, gateRadius, gate.passed);
    }
  }

  const pixelY = top + planeY * playHeight;
  drawPlane(planeX, pixelY, planeSize, Math.max(-0.32, Math.min(0.36, velocity * 0.62)));

  ctx.fillStyle = '#ffffffcc';
  roundedRect(14, Math.max(12, Slop.safeArea.top * 0.18), 126, 42, 21);
  ctx.fill();
  centeredLabel(`${score} · ${gates.filter(gate => gate.passed).length}/5`, 77, Math.max(33, Slop.safeArea.top * 0.18 + 21), '700 16px system-ui');

  if (!started && !over) {
    ctx.fillStyle = '#ffffffed';
    const panelWidth = Math.min(360, width - 34);
    const panelHeight = 126;
    roundedRect((width - panelWidth) / 2, height * 0.52 - panelHeight / 2, panelWidth, panelHeight, 24);
    ctx.fill();
    centeredLabel('TINY FLIGHT', width / 2, height * 0.52 - 28, '900 24px system-ui');
    centeredLabel('Hold to climb · release to glide', width / 2, height * 0.52 + 8, '600 15px system-ui');
    centeredLabel('Touch, click, Space, W or ↑', width / 2, height * 0.52 + 38, '14px system-ui', '#41627c');
  }

  if (over) {
    ctx.fillStyle = '#122844b8';
    ctx.fillRect(0, 0, width, height);
    centeredLabel(won ? 'SMOOTH LANDING!' : 'ROUGH LANDING', width / 2, height * 0.43, '900 27px system-ui', '#ffffff');
    centeredLabel(won ? 'All five rings cleared' : `${score} points`, width / 2, height * 0.49, '600 17px system-ui', '#fff4c8');
    centeredLabel('Use Slop restart to fly again', width / 2, height * 0.56, '14px system-ui', '#d8edff');
  }

  if (!announced) {
    announced = true;
    Slop.ready();
  }
});
