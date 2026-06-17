import "../lib/server/env";
import { chromium } from "playwright";
import { glmAsk, glmConfig } from "@web-access/analyzers";
const cfg = glmConfig()!;
const b = await chromium.launch();
const p = await b.newPage();
await p.setViewportSize({width:300,height:300});
for (const [color, hex] of [["GREEN","#00aa00"],["BLUE","#0000ee"]]) {
  await p.setContent(`<body style="margin:0"><div style="width:300px;height:300px;background:${hex}"></div></body>`, {waitUntil:"domcontentloaded"});
  const png = (await p.screenshot()).toString("base64");
  const ans = await glmAsk([{type:"text",text:"What single color fills this image? Answer with one word only."},{type:"image",base64:png,mediaType:"image/png"}], {model:cfg.visionModel});
  console.log(`expected ${color} → model said: ${JSON.stringify(ans)}`);
}
await b.close();
