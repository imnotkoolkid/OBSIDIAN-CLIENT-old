const { app, session, protocol } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");

const initResourceSwapper = () => {
  const SWAP_FOLDER = path.join(app.getPath("documents"), "ObsidianClient", "swapper");

  const folders = [
    { name: "media", helpUrl: "https://raw.githubusercontent.com/imnotkoolkid/OBSIDIAN-CLIENT/refs/heads/main/assets/media-swapper-help.txt" },
    { name: "img", helpUrl: "https://raw.githubusercontent.com/imnotkoolkid/OBSIDIAN-CLIENT/refs/heads/main/assets/img-swapper-help.txt" }
  ];

  folders.forEach((folderConfig) => {
    const folderPath = path.join(SWAP_FOLDER, folderConfig.name);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      if (folderConfig.helpUrl) {
        https.get(folderConfig.helpUrl, (res) => {
          let data = "";
          res.on("data", (chunk) => data += chunk);
          res.on("end", () => {
            fs.writeFileSync(path.join(folderPath, "help.txt"), data, "utf8");
          });
        }).on("error", (err) => {
          console.error(`Error fetching help.txt for ${folderConfig.name}:`, err);
        });
      }
    }
  });

  protocol.registerFileProtocol("obsidian-swap", (request, callback) => {
    let filePath = decodeURIComponent(request.url.replace("obsidian-swap://", ""));
    if (!fs.existsSync(filePath)) {
      console.error("File not found:", filePath);
      callback({ error: -6 });
      return;
    }
    callback({ path: filePath });
  });

  const swapMap = {};
  const walkSync = (dir, baseDir) => {
    fs.readdirSync(dir).forEach((file) => {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        walkSync(filePath, baseDir);
      } else {
        const relativePath = path.relative(baseDir, filePath).replace(/\\/g, "/");
        const normalizedPath = path.normalize(filePath).replace(/\\/g, "/");
        swapMap[relativePath] = normalizedPath;
      }
    });
  };
  walkSync(SWAP_FOLDER, SWAP_FOLDER);

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["*://kirka.io/assets/*"] },
    (details, callback) => {
      const urlObj = new URL(details.url);
      const assetPath = urlObj.pathname.replace("/assets/", "");
      const ext = path.extname(assetPath).toLowerCase();

      if ([".mp3", ".wav", ".jpg", ".png", ".gif", ".bmp"].includes(ext) && swapMap[assetPath]) {
        const redirectURL = `obsidian-swap://${encodeURIComponent(swapMap[assetPath])}`;
        callback({ redirectURL });
      } else {
        callback({});
      }
    }
  );
};

module.exports = { initResourceSwapper };
