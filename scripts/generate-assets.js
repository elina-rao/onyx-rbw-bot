const canvas = require('canvas');
const { createCanvas, loadImage } = canvas;
const fs = require('fs');
const path = require('path');

const { registerFont } = canvas;
registerFont(path.join(__dirname, '..', 'dist', 'fonts', 'Ubuntu-Bold.ttf'), { family: 'Ubuntu' });

const OUT = path.join(__dirname, '..', 'dist', 'images');

async function generate() {
  // Server icon: 64x64
  console.log('Generating server-icon.png...');
  const icon = createCanvas(64, 64);
  const ictx = icon.getContext('2d');

  // Dark background
  ictx.fillStyle = '#1a1a1a';
  ictx.fillRect(0, 0, 64, 64);

  // Crown shape
  ictx.fillStyle = '#d4a017';
  ictx.beginPath();
  // Crown points
  ictx.moveTo(10, 50);
  ictx.lineTo(8, 20);
  ictx.lineTo(18, 30);
  ictx.lineTo(32, 10);
  ictx.lineTo(46, 30);
  ictx.lineTo(56, 20);
  ictx.lineTo(54, 50);
  ictx.closePath();
  ictx.fill();

  // Crown base
  ictx.fillStyle = '#b8860b';
  ictx.fillRect(10, 44, 44, 8);

  // Gem in center
  ictx.fillStyle = '#e0115f';
  ictx.beginPath();
  ictx.moveTo(28, 32);
  ictx.lineTo(32, 24);
  ictx.lineTo(36, 32);
  ictx.lineTo(32, 40);
  ictx.closePath();
  ictx.fill();

  fs.writeFileSync(path.join(OUT, 'server-icon.png'), icon.toBuffer('image/png'));
  console.log('  Done.');

  // Division emoji images: 64x64 each
  const divisions = [
    { name: 'ash',    color: '#6B6B6B', inner: '#808080' },
    { name: 'stone',  color: '#8A8A8A', inner: '#999999' },
    { name: 'copper', color: '#B87333', inner: '#d4873d' },
    { name: 'silver', color: '#C0C0C0', inner: '#cccccc' },
    { name: 'gold',   color: '#FFD700', inner: '#e6c200' },
    { name: 'ruby',   color: '#E0115F', inner: '#ff4466' },
    { name: 'sapphire', color: '#0F52BA', inner: '#4488ff' },
    { name: 'onyx',   color: '#1A1A1A', inner: '#333333' },
  ];

  const emojiDir = path.join(OUT, 'emoji');
  if (!fs.existsSync(emojiDir)) fs.mkdirSync(emojiDir, { recursive: true });

  for (const div of divisions) {
    console.log(`  Generating ${div.name}.png...`);
    const e = createCanvas(64, 64);
    const ectx = e.getContext('2d');

    // Outer diamond
    ectx.fillStyle = div.color;
    ectx.beginPath();
    ectx.moveTo(32, 4);
    ectx.lineTo(60, 32);
    ectx.lineTo(32, 60);
    ectx.lineTo(4, 32);
    ectx.closePath();
    ectx.fill();

    // Inner diamond
    ectx.fillStyle = div.inner;
    ectx.beginPath();
    ectx.moveTo(32, 12);
    ectx.lineTo(52, 32);
    ectx.lineTo(32, 52);
    ectx.lineTo(12, 32);
    ectx.closePath();
    ectx.fill();

    // Center dot
    ectx.fillStyle = '#ffffff';
    ectx.beginPath();
    ectx.arc(32, 32, 4, 0, Math.PI * 2);
    ectx.fill();

    fs.writeFileSync(path.join(emojiDir, `${div.name}.png`), e.toBuffer('image/png'));
  }
  console.log('  Emoji images done.');

  // Also regenerate division icons as PNG for the bot (480x512 cards need SVGs rendered)
  // SVG rasterization not trivial here, so we skip for now.
  // The existing SVGs will be used for card rendering.
  console.log('All assets generated.');
}

generate().catch(console.error);
