"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const processVideo_1 = require("./processVideo");
const app = (0, express_1.default)();
const port = 3001;
app.get('/process-video', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) {
        return res.status(400).send('Missing URL parameter.');
    }
    try {
        await (0, processVideo_1.processVideo)(videoUrl);
        res.send('Video processing started. Check server logs for details.');
    }
    catch (error) {
        res.status(500).send(`Error processing video: ${error.message}`);
    }
});
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
