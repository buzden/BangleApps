let lockListener;
let quiet;

var settings = Object.assign(
  require('Storage').readJSON("messagesoverlay.default.json", true) || {},
  require('Storage').readJSON("messagesoverlay.json", true) || {}
);

settings = Object.assign({
  fontSmall:"6x8",
  fontMedium:"Vector:14",
  fontBig:g.getFonts().includes("Vector") ? "Vector:20" : "6x8:3",
  fontLarge:"Vector:30",
  reemit: true
}, settings);

const ovrx = settings.border;
const ovry = ovrx;
const ovrw = g.getWidth()-2*ovrx;
const ovrh = g.getHeight()-2*ovry;

let LOG=()=>{};
//LOG = function() { print.apply(null, arguments);};

let isQuiet = function(){
  if (quiet == undefined) quiet = (require('Storage').readJSON('setting.json', 1) || {}).quiet;
  return quiet;
};

let eventQueue = [];
let callInProgress = false;
let buzzing = false;

let show = function(ovr){
  let img = ovr;
  LOG("show", img.getBPP());
  if (ovr.getBPP() == 1) {
    img = ovr.asImage();
    img.palette = new Uint16Array([g.theme.fg,g.theme.bg]);
  }
  Bangle.setLCDOverlay(img, ovrx, ovry);
};

let manageEvent = function(ovr, event) {
  event.new = true;

  LOG("manageEvent");
  if (event.id == "call") {
    showCall(ovr, event);
    return;
  }
  switch (event.t) {
    case "add":
      eventQueue.unshift(event);

      if (!callInProgress)
        showMessage(ovr, event);
      break;

    case "modify": {
      let find = false;
      eventQueue.forEach(element => {
        if (element.id == event.id) {
          find = true;
          Object.assign(element, event);
        }
      });
      if (!find)
        eventQueue.unshift(event);

      if (!callInProgress)
        showMessage(ovr, event);
      break;
    }
    case "remove":
      if (eventQueue.length == 0 && !callInProgress)
        next(ovr);

      if (!callInProgress && eventQueue[0] !== undefined && eventQueue[0].id == event.id)
        next(ovr);
      else 
        eventQueue = [];

      break;
  }
};

let roundedRect = function(ovr, x,y,w,h,filled){
  var poly = [
    x,y+4,
    x+4,y,
    x+w-5,y,
    x+w-1,y+4,
    x+w-1,y+h-5,
    x+w-5,y+h-1,
    x+4,y+h-1,
    x,y+h-5,
    x,y+4
  ];
  ovr.drawPoly(poly,true);
  if (filled) ovr.fillPoly(poly,true);
};

let drawScreen = function(ovr, title, titleFont, src, iconcolor, icon){
  ovr.setColor(ovr.theme.fg);
  ovr.setBgColor(ovr.theme.bg);
  ovr.clearRect(2,2,ovr.getWidth()-3,37);
  
  ovr.setColor(ovr.theme.fg2);
  ovr.setFont(settings.fontSmall);
  ovr.setFontAlign(0,-1);

  let textCenter = (ovr.getWidth()+35-26)/2;

  if (src) {
    let shortened = src;
    while (ovr.stringWidth(shortened) > ovr.getWidth()-80) shortened = shortened.substring(0,shortened.length-2);
    if (shortened.length != src.length) shortened += "...";
    ovr.drawString(shortened, textCenter, 2);
  }

  ovr.setFontAlign(0,0);
  ovr.setFont(titleFont);
  if (title) ovr.drawString(title, textCenter, 38/2 + 5);

  ovr.setColor(ovr.theme.fg);

  ovr.setFont(settings.fontMedium);
  roundedRect(ovr, ovr.getWidth()-26,5,22,30,false);
  ovr.setFont("Vector:16");
  ovr.drawString("X",ovr.getWidth()-14,21);

  ovr.setColor("#888");
  roundedRect(ovr, 5,5,30,30,true);
  ovr.setColor(ovr.getBPP() != 1 ? iconcolor : ovr.theme.bg2);
  ovr.drawImage(icon,8,8);
};

let showMessage = function(ovr, msg) {
  LOG("showMessage");

  if (typeof msg.CanscrollDown === "undefined")
    msg.CanscrollDown = false;
  if (typeof msg.CanscrollUp === "undefined")
    msg.CanscrollUp = false;

  // Normal text message display
  let title = msg.title,
    titleFont = settings.fontLarge,
    lines;
  if (title) {
    let w = ovr.getWidth() - 35 - 26;
    if (ovr.setFont(titleFont).stringWidth(title) > w)
      titleFont = settings.fontMedium;
    if (ovr.setFont(titleFont).stringWidth(title) > w) {
      lines = ovr.wrapString(title, w);
      title = (lines.length > 2) ? lines.slice(0, 2).join("\n") + "..." : lines.join("\n");
    }
  }

  drawScreen(ovr, title, titleFont, msg.src || /*LANG*/ "Message", require("messageicons").getColor(msg), require("messageicons").getImage(msg));

  drawMessage(ovr, msg);

  if (!isQuiet() && msg.new) {
    msg.new = false;
    if (!buzzing){
      buzzing = true;
      Bangle.buzz().then(()=>{setTimeout(()=>{buzzing = false;},2000);});
    }
    Bangle.setLCDPower(1);
  }
};

let drawBorder = function(img) {
  LOG("drawBorder", isQuiet());
  ovr.setBgColor(ovr.theme.bg);
  if (img) ovr=img;
  if (Bangle.isLocked())
    ovr.setColor(ovr.theme.fg);
  else
    ovr.setColor(ovr.theme.fgH);
  ovr.drawRect(0,0,ovr.getWidth()-1,ovr.getHeight()-1);
  ovr.drawRect(1,1,ovr.getWidth()-2,ovr.getHeight()-2);
  ovr.drawRect(2,38,ovr.getWidth()-2,39);
  show(ovr);
};

let showCall = function(ovr, msg) {
  LOG("showCall");
  LOG(msg);

  if (msg.t == "remove") {
    LOG("hide call screen");
    next(ovr); //dont shift
    return;
  }

  callInProgress = true;

  let title = msg.title,
    titleFont = settings.fontLarge,
    lines;
  if (title) {
    let w = ovr.getWidth() - 35 -26;
    if (ovr.setFont(titleFont).stringWidth(title) > w)
      titleFont = settings.fontMedium;
    if (ovr.setFont(titleFont).stringWidth(title) > w) {
      lines = ovr.wrapString(title, w);
      title = (lines.length > 2) ? lines.slice(0, 2).join("\n") + "..." : lines.join("\n");
    }
  }

  drawScreen(ovr, title, titleFont, msg.src || /*LANG*/ "Message", require("messageicons").getColor(msg), require("messageicons").getImage(msg));

  stopCallBuzz();
  if (!isQuiet()) {
    if (msg.new) {
      msg.new = false;
      if (callBuzzTimer) clearInterval(callBuzzTimer);
      callBuzzTimer = setInterval(function() {
        Bangle.buzz(500);
      }, 1000);

      Bangle.buzz(500);
    }
  }
  drawMessage(ovr, msg);
};

let next = function(ovr) {
  LOG("next");
  stopCallBuzz();

  if (!callInProgress)
    eventQueue.shift();

  callInProgress = false;
  if (eventQueue.length == 0) {
    LOG("no element in queue - closing");
    cleanup();
    return false;
  }

  showMessage(ovr, eventQueue[0]);
  return true;
};

let callBuzzTimer = null;
let stopCallBuzz = function() {
  if (callBuzzTimer) {
    clearInterval(callBuzzTimer);
    callBuzzTimer = undefined;
  }
};

let drawTriangleUp = function(ovr) {
  ovr.fillPoly([ovr.getWidth()-9, 46,ovr.getWidth()-14, 56,ovr.getWidth()-4, 56]);
};

let drawTriangleDown = function(ovr) {
  ovr.fillPoly([ovr.getWidth()-9, ovr.getHeight()-6, ovr.getWidth()-14, ovr.getHeight()-16, ovr.getWidth()-4, ovr.getHeight()-16]);
};


let scrollUp = function(ovr) {
  let msg = eventQueue[0];
  LOG("up", msg);
  if (typeof msg.FirstLine === "undefined")
    msg.FirstLine = 0;
  if (typeof msg.CanscrollUp === "undefined")
    msg.CanscrollUp = false;

  if (!msg.CanscrollUp) return;

  msg.FirstLine = msg.FirstLine > 0 ? msg.FirstLine - 1 : 0;

  drawMessage(ovr, msg);
};

let scrollDown = function(ovr) {
  let msg = eventQueue[0];
  LOG("down", msg);
  if (typeof msg.FirstLine === "undefined")
    msg.FirstLine = 0;
  if (typeof msg.CanscrollDown === "undefined")
    msg.CanscrollDown = false;

  if (!msg.CanscrollDown) return;

  msg.FirstLine = msg.FirstLine + 1;
  drawMessage(ovr, msg);
};

let drawMessage = function(ovr, msg) {
  let wrapString = function(str, maxWidth) {
    str = str.replace("\r\n", "\n").replace("\r", "\n");
    return ovr.wrapString(str, maxWidth);
  };
  let wrappedStringHeight = function(strArray){
    let r = 0;
    strArray.forEach((line, i) => {
      let metrics = ovr.stringMetrics(line);
      r += Math.max(metrics.height, metrics.maxImageHeight);
    });
    return r;
  };

  ovr.setColor(ovr.theme.fg);
  ovr.setBgColor(ovr.theme.bg);

  if (typeof msg.FirstLine === "undefined") msg.FirstLine = 0;

  let padding = eventQueue.length > 1 ? (eventQueue.length > 3 ? 7 : 5) : 3;

  let yText = 40;
  let yLine = yText + 3;

  let maxTextHeight = ovr.getHeight() - yLine - padding;

  if (typeof msg.lines === "undefined") {
    let bodyFont = settings.fontBig;
    ovr.setFont(bodyFont);
    msg.lines = wrapString(msg.body, ovr.getWidth() - 4 - padding);

    if (wrappedStringHeight(msg.lines) > maxTextHeight) {
      bodyFont = settings.fontMedium;
      ovr.setFont(bodyFont);
      msg.lines = wrapString(msg.body, ovr.getWidth() - 4 - padding);
    }
    msg.bodyFont = bodyFont;
    msg.lineHeights = [];
    msg.lines.forEach((line, i) => {
      let metrics = ovr.stringMetrics(line);
      msg.lineHeights[i] = Math.max(metrics.height, metrics.maxImageHeight);
    });
  }

  ovr.setFont(msg.bodyFont);
  ovr.setColor(ovr.theme.fg);
  ovr.setBgColor(ovr.theme.bg);
  ovr.clearRect(2, yText, ovr.getWidth()-3, ovr.getHeight()-3);

  let xText = 4;

  if (msg.bodyFont == settings.fontBig) {
    ovr.setFontAlign(0, -1);
    xText = Math.round(ovr.getWidth() / 2 - (padding - 3) / 2) + 1;
    yLine = (ovr.getHeight() + yLine) / 2 - (wrappedStringHeight(msg.lines) / 2);
    ovr.drawString(msg.lines.join("\n"), xText, yLine);
  } else {
    ovr.setFontAlign(-1, -1);
  }

  let currentLine = msg.FirstLine;

  let drawnHeight = 0;

  while(drawnHeight < maxTextHeight) {
    let lineHeight = msg.lineHeights[currentLine];
    if (drawnHeight + lineHeight < maxTextHeight) {
      ovr.drawString(msg.lines[currentLine], xText, yLine + drawnHeight);
      drawnHeight += lineHeight;
      currentLine++;
    } else {
      break;
    }
  }

  if (eventQueue.length > 1){
    ovr.drawLine(ovr.getWidth()-4,ovr.getHeight()/2,ovr.getWidth()-4,ovr.getHeight()-4);
    ovr.drawLine(ovr.getWidth()/2,ovr.getHeight()-4,ovr.getWidth()-4,ovr.getHeight()-4);
  }
  if (eventQueue.length > 3){
    ovr.drawLine(ovr.getWidth()-6,ovr.getHeight()*0.6,ovr.getWidth()-6,ovr.getHeight()-6);
    ovr.drawLine(ovr.getWidth()*0.6,ovr.getHeight()-6,ovr.getWidth()-6,ovr.getHeight()-6);
  }

  ovr.setColor(ovr.theme.fg2);
  if (msg.FirstLine != 0) {
    msg.CanscrollUp = true;
    drawTriangleUp(ovr);
  } else
    msg.CanscrollUp = false;

  if (currentLine < msg.lines.length) {
    msg.CanscrollDown = true;
    drawTriangleDown(ovr);
  } else
    msg.CanscrollDown = false;

  show(ovr);
};

let getDragHandler = function(ovr){
  return (e) => {
    if (e.dy > 0) {
      scrollUp(ovr);
    } else if (e.dy < 0){
      scrollDown(ovr);
    }
  };
};

let getTouchHandler = function(ovr){
  return (_, xy) => {
    if (xy.y < ovry + 40){
      next(ovr);
    }
  };
};

const EVENTS=["touch", "drag", "swipe", "lock"];

let hasBackup = false;

let origOn = Bangle.on;
let backupOn = function(event, handler){
  if (EVENTS.includes(event)){
    if (!backup[event])
      backup[event] = [];
    backup[event].push(handler);
  }
  else origOn.call(Bangle, event, handler);
};

let origRemove = Bangle.removeListener;
let backupRemove = function(event, handler){
  if (EVENTS.includes(event) && backup[event]){
    LOG("backup for " + event + ": " + backup[event]);
    backup[event] = backup[event].filter(e=>e!==handler);
  }
  else origRemove.call(Bangle, event, handler);
};

let origRemoveAll = Bangle.removeAllListeners;
let backupRemoveAll = function(event){
  if (backup[event])
    backup[event] = undefined;
  origRemoveAll.call(Bangle);
};

let restoreHandlers = function(){
  if (!hasBackup){
    LOG("No backup available");
    return;
  }

  for (let event of EVENTS){
    LOG("Restore", backup[event]);
    origRemoveAll.call(Bangle, event);
    if (backup[event] && backup[event].length == 1)
      backup[event] = backup[event][0];
    Bangle["#on" + event]=backup[event];
    backup[event] = undefined;
  }

  Bangle.on = origOn;
  Bangle.removeListener = origRemove;
  Bangle.removeAllListeners = origRemoveAll;

  hasBackup = false;
};

let backupHandlers = function(){
  if (hasBackup){
    LOG("Backup already exists");
    return false; // do not backup, overlay is already up
  }

  for (let event of EVENTS){
    backup[event] = Bangle["#on" + event];
    if (typeof backup[event] == "function")
      backup[event] = [ backup[event] ];
    LOG("Backed up", backup[event], event);
    Bangle.removeAllListeners(event);
  }

  Bangle.on = backupOn;
  Bangle.removeListener = backupRemove;
  Bangle.removeAllListeners = backupRemoveAll;

  hasBackup = true;

  return true;
};

let cleanup = function(){
  if (lockListener) {
    Bangle.removeListener("lock", lockListener);
    lockListener = undefined;
  }
  restoreHandlers();

  Bangle.setLCDOverlay();
  ovr = undefined;
  quiet = undefined;
};

let backup = {};

let main = function(ovr, event) {
  LOG("Main", event.t);
  let didBackup = backupHandlers();

  if (!lockListener) {
    lockListener = function (e){
      updateClearingTimeout();
      drawBorder();
    };
    LOG("Add overlay lock handlers");
    origOn.call(Bangle, 'lock', lockListener);
  }

  if (didBackup){
    LOG("Add overlay UI handlers");
    origOn.call(Bangle, 'touch', getTouchHandler(ovr));
    origOn.call(Bangle, 'drag', getDragHandler(ovr));
  }

  if (event !== undefined){
    drawBorder(ovr);
    manageEvent(ovr, event);
  } else {
    LOG("No event given");
    cleanup();
  }
};

let ovr;
let clearingTimeout;

let updateClearingTimeout = ()=>{
  LOG("updateClearingTimeout");
  if (settings.autoclear <= 0)
    return;
  LOG("Remove clearing timeout", clearingTimeout);
  if (clearingTimeout) clearTimeout(clearingTimeout);
  if (Bangle.isLocked()){
    LOG("Set new clearing timeout");
    clearingTimeout = setTimeout(()=>{
      LOG("setNewTimeout");
      let event = eventQueue.pop();
      if (event)
        drawMessage(ovr, event);
      if (eventQueue.length > 0){
        LOG("still got elements");
        updateClearingTimeout();
      } else {
        cleanup();
      }
    }, settings.autoclear * 1000);
  } else {
    clearingTimeout = undefined;
  }
};

exports.message = function(type, event) {
  LOG("Got message", type, event);
  // only handle some event types
  if(!(type=="text" || type == "call")) return;
  if(type=="text" && event.id == "nav") return;
  if(event.handled) return;
  if(event.messagesoverlayignore) return;

  bpp = 4;
  if (process.memory().free < settings.lowmwm)
    bpp = 1;

  while (process.memory().free < settings.minfreemem && eventQueue.length > 0){
    let dropped = eventQueue.pop();
    print("Dropped message because of memory constraints", dropped);
  }

  if (!ovr || ovr.getBPP() != bpp) {
    ovr = Graphics.createArrayBuffer(ovrw, ovrh, bpp, {
      msb: true
    });
  }

  ovr.reset();

  if (bpp == 4)
    ovr.theme = g.theme;
  else
    ovr.theme = { fg:0, bg:1, fg2:1, bg2:0, fgH:1, bgH:0 };

  ovr.clear();
  main(ovr, event);

  updateClearingTimeout();

  if (!isQuiet()) Bangle.setLCDPower(1);
  event.handled = true;
};
