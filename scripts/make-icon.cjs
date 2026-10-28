// makes build/icon.png: the aperture logo coloured orange with a music note in the middle.
// run it with `npm run icon`
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const toUrl = (buf) => 'data:image/svg+xml;base64,' + Buffer.from(buf).toString('base64');
const logo = toUrl(fs.readFileSync(path.join(__dirname, '..', 'public', 'aperture-science.svg')));
const note = toUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <polygon points="33,24 80,13 80,24 33,35"/>
  <rect x="33" y="24" width="7" height="50"/><rect x="73" y="13" width="7" height="50"/>
  <ellipse cx="27" cy="74" rx="13" ry="9.5" transform="rotate(-22 27 74)"/>
  <ellipse cx="67" cy="63" rx="13" ry="9.5" transform="rotate(-22 67 63)"/>
</svg>`);
const fill = 'radial-gradient(circle,#ffc93c 20%,#f5a31a 75%)';

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true });
  const html = `<html><body style="margin:0;background:transparent">
    <div style="position:relative;width:512px;height:512px">
      <div style="position:absolute;inset:0;background:${fill};-webkit-mask:url(${logo}) center/contain no-repeat"></div>
      <div style="position:absolute;left:31%;top:31%;width:38%;height:38%;background:${fill};-webkit-mask:url(${note}) center/contain no-repeat"></div>
    </div></body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), img.resize({ width: 512, height: 512 }).toPNG());
  app.quit();
});
