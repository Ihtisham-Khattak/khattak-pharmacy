const app = require("express")();
const bodyParser = require("body-parser");
const multer = require("multer");
const sanitizeFilename = require("sanitize-filename");
const fs = require("fs");
const path = require("path");
const validator = require("validator");
const { db } = require("./db");

const appName = process.env.APPNAME || "PharmaSpot";
const appData = process.env.APPDATA || "";

const maxFileSize = 2097152; // 2MB
const defaultLogoName = "logo";
const { filterFile } = require("../assets/js/utils");

const storage = multer.diskStorage({
  destination: path.join(appData, appName, "uploads"),
  filename: function (req, file, callback) {
    callback(null, defaultLogoName + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: maxFileSize },
  fileFilter: filterFile,
}).single("imagename");

app.use(bodyParser.json());

module.exports = app;

/**
 * GET endpoint: Get settings details.
 */
app.get("/get", function (req, res) {
  try {
    const row = db.prepare("SELECT * FROM settings WHERE id = 1").get();
    if (row) {
      // Format to match old structure for frontend compatibility
      res.send({
        _id: 1,
        settings: {
          app: row.app,
          store: row.store,
          address_one: row.address_one,
          address_two: row.address_two,
          contact: row.contact,
          tax: row.tax,
          symbol: row.symbol,
          percentage: row.percentage,
          charge_tax: row.charge_tax === 1,
          footer: row.footer,
          img: row.img,
        },
      });
    } else {
      res.send(null);
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * POST endpoint: Create or update settings.
 */
app.post("/post", function (req, res) {
  upload(req, res, function (err) {
    if (err) {
      return res
        .status(400)
        .json({ error: "Upload Error", message: err.message });
    }

    try {
      let image = "";
      if (req.body.img && validator.escape(req.body.img) !== "") {
        image = sanitizeFilename(req.body.img);
      }
      if (req.file) {
        image = sanitizeFilename(req.file.filename);
      }

      if (req.body.remove === "1") {
        try {
          let imgPath = path.join(appData, appName, "uploads", image);
          if (fs.existsSync(imgPath) && !req.file) {
            fs.unlinkSync(imgPath);
            image = "";
          }
        } catch (err) {
          console.error(err);
        }
      }

      const settings = {
        app: validator.escape(req.body.app || ""),
        store: validator.escape(req.body.store || ""),
        address_one: validator.escape(req.body.address_one || ""),
        address_two: validator.escape(req.body.address_two || ""),
        contact: validator.escape(req.body.contact || ""),
        tax: parseFloat(req.body.tax || 0),
        symbol: validator.escape(req.body.symbol || ""),
        percentage: parseFloat(req.body.percentage || 0),
        charge_tax: req.body.charge_tax === "on" ? 1 : 0,
        footer: validator.escape(req.body.footer || ""),
        img: image,
      };

      const existing = db.prepare("SELECT id FROM settings WHERE id = 1").get();
      if (!existing) {
        db.prepare(
          `
                    INSERT INTO settings (id, app, store, address_one, address_two, contact, tax, symbol, percentage, charge_tax, footer, img)
                    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
        ).run(
          settings.app,
          settings.store,
          settings.address_one,
          settings.address_two,
          settings.contact,
          settings.tax,
          settings.symbol,
          settings.percentage,
          settings.charge_tax,
          settings.footer,
          settings.img,
        );
      } else {
        db.prepare(
          `
                    UPDATE settings SET 
                        app = ?, store = ?, address_one = ?, address_two = ?, 
                        contact = ?, tax = ?, symbol = ?, percentage = ?, 
                        charge_tax = ?, footer = ?, img = ?
                    WHERE id = 1
                `,
        ).run(
          settings.app,
          settings.store,
          settings.address_one,
          settings.address_two,
          settings.contact,
          settings.tax,
          settings.symbol,
          settings.percentage,
          settings.charge_tax,
          settings.footer,
          settings.img,
        );
      }
      res.sendStatus(200);
    } catch (err) {
      res
        .status(500)
        .json({ error: "Internal Server Error", message: err.message });
    }
  });
});
