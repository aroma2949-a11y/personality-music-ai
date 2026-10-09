import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: "24kb" }));
app.use(express.static(__dirname));

const port = process.env.PORT || 3000;

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;

const openai = apiKey
  ? new OpenAI({ apiKey })
  : null;


/* =========================================================
   VALID VALUES
========================================================= */

const mbti = new Set([
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP"
]);


const love = new Set([
  "一途に愛する",
  "追いかけたい",
  "追われたい",
  "甘えたい",
  "尽くしたい",
  "じっくり進めたい",
  "自由な恋愛が好き",
  "安心感を大切にする",

  "LCRO｜ボス猫",
  "LCRE｜隠れベイビー",
  "LCPO｜主役体質",
  "LCPE｜ツンデレヤンキー",
  "LARO｜憧れの先輩",
  "LARE｜カリスマバランサー",
  "LAPO｜パーフェクトカメレオン",
  "LAPE｜キャプテンライオン",

  "FCRO｜ロマンスマジシャン",
  "FCRE｜ちゃっかりうさぎ",
  "FCPO｜恋愛モンスター",
  "FCPE｜忠犬ハチ公",
  "FARO｜不思議生命体",
  "FARE｜敏腕マネージャー",
  "FAPO｜デビル天使",
  "FAPE｜最後の恋人"
]);


const gender = new Set([
  "男性",
  "女性",
  "その他",
  "回答しない"
]);


const age = new Set([
  "10代",
  "20代",
  "30代",
  "40代",
  "50代以上"
]);


/* =========================================================
   RATE LIMIT
========================================================= */

const hits = new Map();


function rateLimit(req, res, next) {

  const key = (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.ip ||
    "unknown"
  ).trim();


  const now = Date.now();


  const recent = (
    hits.get(key) ||
    []
  ).filter(
    time =>
      now - time < 600000
  );


  if (recent.length >= 12) {

    return res
      .status(429)
      .json({
        error:
          "短時間に選曲しすぎています。少し時間を空けてください。"
      });

  }


  recent.push(now);

  hits.set(
    key,
    recent
  );


  next();

}


/* =========================================================
   CLEAN
========================================================= */

function clean(
  value,
  max = 300
) {

  return typeof value === "string"
    ? value.trim().slice(0, max)
    : "";

}


/* =========================================================
   APPLE MUSIC SEARCH
========================================================= */

async function searchAppleMusic(
  artist,
  title
) {

  const term =
    encodeURIComponent(
      `${artist} ${title}`
    );


  const response =
    await fetch(
      `https://itunes.apple.com/search?term=${term}&country=JP&media=music&entity=song&limit=6&lang=ja_jp`
    );


  if (!response.ok) {

    return null;

  }


  const data =
    await response.json();


  const normalize =
    value =>
      String(
        value ||
        ""
      )
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(
          /[()（）【】'".・\-]/g,
          ""
        );


  return (

    data.results?.find(
      song =>

        normalize(
          song.trackName
        ).includes(
          normalize(title)
        )

        ||

        normalize(
          title
        ).includes(
          normalize(
            song.trackName
          )
        )

    )

    ||

    data.results?.[0]

    ||

    null

  );

}


/* =========================================================
   PROMPT
========================================================= */

function makePrompt(
  body
) {

  const base = `
あなたは日本のユーザー向け音楽キュレーターです。
入力内容は好みを断定する診断ではなく、推薦のヒントとして使ってください。

実在する楽曲を8曲推薦してください。
同じアーティストに偏らないでください。
1曲目を最有力のおすすめにしてください。
1曲は少し意外性のある冒険枠にしてください。

歌詞そのものは引用せず、意味や感情、場面を要約してください。
存在しない歌詞や具体的な再生位置を作らないでください。
性別・年代・MBTIだけで好みを断定しないでください。

必ず最後まで完成したJSONだけを返してください。
Markdownや説明文は不要です。

形式:
{
  "listenerType":"短い音楽タイプ名",
  "listenerDescription":"100文字程度",
  "recommendations":[
    {
      "artist":"正式なアーティスト名",
      "title":"正式な曲名",
      "summary":"曲の内容を60文字程度",
      "why":"この人に合う理由を80文字程度",
      "lyricPoint":"歌詞を引用せず刺さる感情や場面を60文字程度",
      "listenPoint":"聴くときの注目点を60文字程度",
      "mood":"happy/sad/night/rock/chill/hope/love/dark"
    }
  ]
}`;


  if (
    body.mode ===
    "manual"
  ) {

    return `${base}

条件:
気分=${clean(body.mood) || "指定なし"}
場面=${clean(body.scene) || "指定なし"}
恋愛=${clean(body.romance) || "指定なし"}
ジャンル=${clean(body.genre) || "指定なし"}
知名度=${clean(body.fame) || "指定なし"}
重視=${clean(body.focus) || "指定なし"}
参考曲=${clean(body.reference) || "指定なし"}
自由入力=${clean(body.freeText) || "指定なし"}`;

  }


  return `${base}

MBTI=${body.mbti}
恋愛タイプ=${body.love}
性別=${body.gender}
年代=${body.age}
今の気分=${clean(body.mood)}`;

}


/* =========================================================
   PARSE AI
========================================================= */

function parseAIResponse(
  raw
) {

  if (!raw) {

    throw new Error(
      "AI response was empty"
    );

  }


  const cleaned =
    raw
      .trim()
      .replace(
        /^```json\s*/i,
        ""
      )
      .replace(
        /^```\s*/i,
        ""
      )
      .replace(
        /\s*```$/i,
        ""
      );


  return JSON.parse(
    cleaned
  );

}


/* =========================================================
   ASK AI
========================================================= */

async function askAI(
  body
) {

  let lastError;


  for (
    let attempt = 1;
    attempt <= 2;
    attempt++
  ) {

    try {

      const response =
        await openai
          .responses
          .create({

            model,

            input:
              makePrompt(body),

            max_output_tokens:
              5000

          });


      if (
        response.status ===
        "incomplete"
      ) {

        throw new Error(
          `AI output incomplete: ${
            response
              .incomplete_details
              ?.reason ||
            "unknown"
          }`
        );

      }


      return parseAIResponse(
        response.output_text
      );

    }
    catch (error) {

      lastError =
        error;


      console.error(
        `AI attempt ${attempt} failed:`,
        error
      );


      if (
        attempt < 2
      ) {

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              500
            )
        );

      }

    }

  }


  throw lastError;

}


/* =========================================================
   ENRICH ONE SONG
========================================================= */

async function enrichRecommendation(
  item
) {

  if (
    !item ||
    !item.artist ||
    !item.title
  ) {

    return null;

  }


  try {

    const song =
      await searchAppleMusic(
        item.artist,
        item.title
      );


    if (!song) {

      return null;

    }


    return {

      title:
        song.trackName,

      artist:
        song.artistName,

      album:
        song.collectionName,

      artwork:
        (
          song.artworkUrl100 ||
          ""
        ).replace(
          "100x100bb",
          "600x600bb"
        ),

      appleMusic:
        song.trackViewUrl,

      summary:
        clean(
          item.summary,
          240
        ),

      why:
        clean(
          item.why,
          300
        ),

      lyricPoint:
        clean(
          item.lyricPoint,
          240
        ),

      listenPoint:
        clean(
          item.listenPoint,
          240
        ),

      mood:
        clean(
          item.mood,
          30
        )

    };

  }
  catch (error) {

    console.error(
      `Apple Music search failed: ${item.artist} - ${item.title}`,
      error
    );


    /*
      1曲失敗しても、
      他の4曲まで巻き添えにしない
    */

    return null;

  }

}


/* =========================================================
   ADD UNIQUE SONGS
========================================================= */

function appendUniqueSongs(
  target,
  items,
  limit = 5
) {

  for (
    const item of items
  ) {

    if (!item) {

      continue;

    }


    const duplicate =
      target.some(
        existing =>

          existing.title ===
            item.title

          &&

          existing.artist ===
            item.artist
      );


    if (duplicate) {

      continue;

    }


    target.push(
      item
    );


    if (
      target.length >=
      limit
    ) {

      break;

    }

  }

}


/* =========================================================
   PARALLEL APPLE MUSIC SEARCH
========================================================= */

async function buildRecommendations(
  rawRecommendations
) {

  const candidates =
    (
      Array.isArray(
        rawRecommendations
      )
        ? rawRecommendations
        : []
    )
      .filter(
        item =>
          item &&
          item.artist &&
          item.title
      )
      .slice(
        0,
        8
      );


  const recommendations =
    [];


  /*
    ------------------------------------------
    BATCH 1

    まず最有力5曲を同時に検索する。

    Promise.all は
    完了した順ではなく、
    元配列と同じ順番で返してくれるので、

    AIが選んだ1曲目 = BEST MATCH

    の順番も維持される。
    ------------------------------------------
  */

  const firstBatch =
    candidates.slice(
      0,
      5
    );


  const firstResults =
    await Promise.all(
      firstBatch.map(
        enrichRecommendation
      )
    );


  appendUniqueSongs(
    recommendations,
    firstResults,
    5
  );


  /*
    ------------------------------------------
    BATCH 2

    Apple Musicで見つからなかった曲や
    重複があって5曲揃わなかった場合だけ、

    AIが出した6〜8曲目を
    まとめて同時検索する。
    ------------------------------------------
  */

  if (
    recommendations.length < 5
    &&
    candidates.length > 5
  ) {

    const fallbackBatch =
      candidates.slice(
        5,
        8
      );


    const fallbackResults =
      await Promise.all(
        fallbackBatch.map(
          enrichRecommendation
        )
      );


    appendUniqueSongs(
      recommendations,
      fallbackResults,
      5
    );

  }


  return recommendations
    .slice(
      0,
      5
    );

}


/* =========================================================
   RECOMMEND API
========================================================= */

app.post(
  "/api/recommend",
  rateLimit,
  async (
    req,
    res
  ) => {

    const body =
      req.body ||
      {};


    const valid =

      body.mode ===
      "manual"

      ?

      [
        "mood",
        "scene",
        "romance",
        "genre",
        "fame",
        "focus",
        "reference",
        "freeText"
      ].some(
        key =>
          clean(
            body[key]
          )
      )

      :

      mbti.has(
        body.mbti
      )

      &&

      love.has(
        body.love
      )

      &&

      gender.has(
        body.gender
      )

      &&

      age.has(
        body.age
      )

      &&

      clean(
        body.mood
      );


    if (!valid) {

      return res
        .status(400)
        .json({

          error:
            "入力値が正しくありません。"

        });

    }


    if (
      !openai ||
      !model
    ) {

      return res
        .status(500)
        .json({

          error:
            "AI設定が未設定です。"

        });

    }


    try {

      const totalStartedAt =
        Date.now();


      /*
        AIが8候補を作る
      */

      const aiStartedAt =
        Date.now();


      const result =
        await askAI(
          body
        );


      console.log(
        `AI generation: ${
          Date.now() -
          aiStartedAt
        }ms`
      );


      /*
        Apple Music確認

        ここが今回の変更点。
        1曲ずつではなく、
        最大5曲を同時に検索する。
      */

      const appleStartedAt =
        Date.now();


      const recommendations =
        await buildRecommendations(
          result.recommendations
        );


      console.log(
        `Apple Music search: ${
          Date.now() -
          appleStartedAt
        }ms`
      );


      console.log(
        `Total recommendation: ${
          Date.now() -
          totalStartedAt
        }ms`
      );


      if (
        recommendations.length ===
        0
      ) {

        return res
          .status(502)
          .json({

            error:
              "楽曲検索に失敗しました。もう一度試してください。"

          });

      }


      res.json({

        listenerType:
          clean(
            result.listenerType,
            80
          ),

        listenerDescription:
          clean(
            result.listenerDescription,
            300
          ),

        recommendations

      });

    }
    catch (error) {

      console.error(
        "Recommendation error:",
        error
      );


      res
        .status(502)
        .json({

          error:
            "AIの選曲に一時的に失敗しました。もう一度試してください。"

        });

    }

  }
);


/* =========================================================
   FRONTEND
========================================================= */

app.get(
  "/{*splat}",
  (
    req,
    res
  ) => {

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );

  }
);


/* =========================================================
   START
========================================================= */

app.listen(
  port,
  () => {

    console.log(
      `YOUR SOUND: http://localhost:${port}`
    );

  }
);
