import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(__dirname));

const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;

if (!apiKey) console.warn("OPENAI_API_KEY is not set.");
if (!model) console.warn("OPENAI_MODEL is not set.");

const openai = apiKey ? new OpenAI({ apiKey }) : null;

const allowed = {
  mbti: new Set(["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP","ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"]),
  love: new Set(["一途に愛する","追いかけたい","追われたい","甘えたい","尽くしたい","じっくり進めたい","自由な恋愛が好き","安心感を大切にする"]),
  gender: new Set(["男性","女性","その他","回答しない"]),
  age: new Set(["10代","20代","30代","40代","50代以上"])
};

function validInput(body) {
  return body &&
    allowed.mbti.has(body.mbti) &&
    allowed.love.has(body.love) &&
    allowed.gender.has(body.gender) &&
    allowed.age.has(body.age);
}

async function searchAppleMusic(artist, title) {
  const term = encodeURIComponent(`${artist} ${title}`);
  const url = `https://itunes.apple.com/search?term=${term}&country=JP&media=music&entity=song&limit=5&lang=ja_jp`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json();
  return data.results?.[0] ?? null;
}

app.post("/api/recommend", async (req, res) => {
  if (!validInput(req.body)) {
    return res.status(400).json({ error: "入力値が正しくありません。" });
  }
  if (!openai || !model) {
    return res.status(500).json({ error: "サーバー側のAI設定が未設定です。" });
  }

  const { mbti, love, gender, age } = req.body;

  try {
    const response = await openai.responses.create({
      model,
      input: `あなたは日本の音楽キュレーターです。
以下の4項目を音楽推薦のヒントとして使い、実在する楽曲を8曲推薦してください。
性別や年代から音楽の好みを断定しないでください。
日本語曲を中心に、必要なら海外曲も含めてください。
現在も検索しやすい実在曲を優先してください。

MBTI: ${mbti}
恋愛タイプ: ${love}
性別: ${gender}
年代: ${age}

JSONのみを返してください。形式:
{"recommendations":[{"artist":"アーティスト名","title":"曲名","reason":"この人に合う理由を日本語50文字以内"}]}`
    });

    let raw = response.output_text?.trim();
    if (!raw) throw new Error("AI response was empty.");

    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(raw);

    const results = [];
    for (const item of (parsed.recommendations || []).slice(0, 8)) {
      if (!item.artist || !item.title) continue;
      const hit = await searchAppleMusic(item.artist, item.title);
      if (hit) results.push({
        title: hit.trackName,
        artist: hit.artistName,
        album: hit.collectionName,
        artwork: hit.artworkUrl100,
        appleMusic: hit.trackViewUrl,
        reason: item.reason
      });
      if (results.length >= 5) break;
    }

    res.json({
      profile: { mbti, love, gender, age },
      recommendations: results
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "AIまたは音楽検索に失敗しました。" });
  }
});

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Personality Music: http://localhost:${port}`);
});
