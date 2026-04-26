      const TOTAL = 3600,
        KEY = "bear-shinkou-timer-v11",
        BASE_HOUR = 11,
        BASE_MIN = 30,
        SEC = [
          [`opening`, `開始・注意事項`, `0:00-0:03`, 0, 180],
          [`quiz`, `先生クイズ（7分）`, `0:03-0:10`, 180, 600],
          [`comments`, `クイズ締め・先生コメント`, `0:10-0:13`, 600, 780],
          [`chat`, `歓談・くじ引き・お菓子`, `0:13-0:35`, 780, 2100],
          [`game`, `親子ミニゲーム：新聞紙じゃんけん`, `0:35-0:55`, 2100, 3300],
          [`closing`, `終わりの挨拶・片付け`, `0:55-1:00`, 3300, 3600],
        ],
        DATA = [
          [
            `opening-000`,
            `opening`,
            `0:00`,
            0,
            `「みなさん、遠足おつかれさまでした！本日は懇親会へご参加いただき、ありがとうございます。これから短い時間ですが、先生クイズと親子ゲームをしながら、楽しく交流できればと思います。」`,
            `不参加者・途中退出者がいればネームカードを回収する。先生方に前へ出てもらい、2mくらい間隔をあけて立ってもらう。`,
          ],
          [
            `opening-001`,
            `opening`,
            `0:01`,
            60,
            `「最初にお願いです。ここは公園なので、お子さんが遊具で遊びたくなった場合は出入り自由です。その場合は、保護者の方が付き添いをお願いします。」`,
            `スタンプカードを子どもたちへ配る。まとめて近くの保護者へ渡し、回してもらう。`,
          ],
          [
            `opening-002`,
            `opening`,
            `0:02`,
            120,
            `「事故やケガがないよう、お子さんから目を離さないようにお願いします。あとでお菓子をお渡ししますが、個別のアレルギー対応が難しいため、各ご家庭で確認をお願いします。ゴミはこちらで回収しますので、最後にお持ちください。」`,
            `3名ほどの保護者にスタンプを渡し、スタンプ係をお願いする。`,
          ],
          [
            `opening-003`,
            `opening`,
            `0:03`,
            180,
            `「それでは、最初のイベントとして先生クイズを行います。先生方、よろしくお願いします！」`,
            `スタンプ係の立ち位置を確認。司会が時間を見ながら進める。遅れに気づいた役員は合図する。`,
          ],
          [
            `quiz-rule-1`,
            `quiz`,
            `0:03`,
            195,
            `“Please guess which teacher gave the answer. Move to the teacher you think is correct.”|「今から先生にちなんだクイズを出します。どの先生の答えだと思うか、親子で相談して、正解だと思う先生のところへ移動してください。」`,
            `子どもが走らないよう、周囲で声かけする。先生方の位置が分かりやすいように誘導する。`,
          ],
          [
            `quiz-rule-2`,
            `quiz`,
            `0:04`,
            240,
            `「移動のときは走らず、ゆっくりお願いします。正解した人にはスタンプを押します。たくさん集めてくださいね！」`,
            `スタンプカードを持っていない子がいないか確認する。`,
          ],
          [
            `quiz-q1`,
            `quiz`,
            `Q1`,
            260,
            `【早起き】|“Question 1. Which teacher woke up the earliest this morning?”|「第1問です。今朝、一番早起きだった先生は誰でしょう？」|“You have 10 seconds to move. Ten, nine, eight...”|「10秒数えます。正解だと思う先生のところへ移動してください。10, 9, 8...」`,
            `子どもたちの移動を見守る。`,
          ],
          [
            `quiz-q1-answer`,
            `quiz`,
            `Q1 正解`,
            300,
            `“Let's ask the teachers. Maiko sensei, what time did you wake up? How about Miri sensei? And Nicole sensei?”|「決まりましたか？では先生たちに聞いてみましょう。Maiko先生、何時に起きましたか？ Miri先生は？ Nicole先生は？」|「正解は、〇〇先生でした！」`,
            `当日確認。正解者にスタンプを押す。`,
          ],
          [
            `quiz-q2`,
            `quiz`,
            `Q2`,
            325,
            `【好きな食べ物】|“Question 2. Which teacher's favorite food is chocolate?”|「続いて第2問です。チョコレートが一番好きな食べ物の先生は誰でしょう？」|“You have 10 seconds to move. Ten, nine, eight...”|「正解だと思う先生のところへ移動してください。10, 9, 8...」|「正解は、Maiko先生でした！チョコレート、好きなお友だちも多いかな？」`,
            `Maiko先生。正解者にスタンプを押す。`,
          ],
          [
            `quiz-q3`,
            `quiz`,
            `Q3`,
            390,
            `【苦手なもの】|“Question 3. Which teacher does not like corn and peas?”|「第3問です。コーンとお豆がちょっと苦手な先生は誰でしょう？」|“You have 10 seconds to move. Ten, nine, eight...”|「移動してください。10, 9, 8...」|「正解は、Miri先生でした！コーンとお豆、みんなは好きかな？」`,
            `Miri先生。役員は残り時間を確認し、遅れそうなら司会へ合図する。正解者にスタンプを押す。`,
          ],
          [
            `quiz-q4`,
            `quiz`,
            `Q4`,
            455,
            `【よく言う言葉】|“Question 4. Which teacher often says 'Hip Hip'?”|「第4問です。クラスでよく『Hip Hip』と言っている先生は誰でしょう？」|“You have 10 seconds to move. Ten, nine, eight...”|「正解だと思う先生のところへどうぞ。10, 9, 8...」`,
            `Nicole先生。子どもたちの移動を見守る。`,
          ],
          [
            `quiz-q4-answer`,
            `quiz`,
            `Q4 正解`,
            510,
            `“Nicole sensei, could you say it the way you usually do?”|「正解は、Nicole先生でした！Nicole先生、いつもの感じでお願いします。」|Nicole先生の一言後：「ありがとうございます！」`,
            `子どもたちが聞けるよう少し静かにする。正解者にスタンプを押す。`,
          ],
          [
            `comments-010`,
            `comments`,
            `0:10`,
            600,
            `「先生クイズはここまでです。スタンプはいくつ集まりましたか？カードはあとで使いますので、まだ持っていてくださいね。」`,
            `スタンプ押しが残っていれば手早く完了する。`,
          ],
          [
            `comments-011`,
            `comments`,
            `0:11`,
            660,
            `“Teachers, could you please share one thing parents can do that would be helpful?”|「最後に、先生方から保護者へ『こうしてもらえると嬉しいです』ということを一言ずついただければと思います。」`,
            `先生が話しやすいように周囲を静かにする。`,
          ],
          [
            `comments-maiko`,
            `comments`,
            `0:11`,
            685,
            `Maiko先生へ：「Maiko先生、お願いします。」`,
            ``,
          ],
          [
            `comments-miri`,
            `comments`,
            `0:12`,
            720,
            `Miri先生へ：「Miri先生、お願いします。」`,
            ``,
          ],
          [
            `comments-nicole`,
            `comments`,
            `0:12`,
            745,
            `Nicole先生へ：「Nicole先生、お願いします。」`,
            ``,
          ],
          [
            `comments-013`,
            `comments`,
            `0:13`,
            780,
            `「先生方、ありがとうございました。今年度もどうぞよろしくお願いします。みなさん、先生方に拍手をお願いします！」`,
            `拍手を誘導。先生が退出しやすいよう動線を空ける。先生が退席する際に、マイクを返却する。`,
          ],
          [
            `chat-013`,
            `chat`,
            `0:13`,
            790,
            `「ここからは少し歓談タイムに入ります。レジャーシートをお持ちの方は広げていただき、できるだけ円になるように座りましょう。円が大きくなりすぎる場合は、いくつかのグループに分かれてください。」`,
            `パパ達に声をかけ、レジャーシートを広げる。円になるよう誘導する。`,
          ],
          [
            `chat-015`,
            `chat`,
            `0:15`,
            900,
            `「子どもたちは、スタンプカードを持ってこちらに集まってください。スタンプが多い人から順番にくじ引きをします。」`,
            `くじ引き箱とお菓子を準備する。スタンプ数ごとに子どもを並べる。`,
          ],
          [
            `chat-017`,
            `chat`,
            `0:17`,
            1020,
            `「くじを引いたら、番号のお菓子をもらって、パパ・ママのところへ戻ってください。」`,
            `くじとお菓子を交換する。終わった子を保護者の元へ戻す。`,
          ],
          [
            `chat-020`,
            `chat`,
            `0:20`,
            1200,
            `「保護者の皆さんは、近くの方同士でぜひお話しください。」`,
            `ゴミ袋とウェットティッシュを分かりやすい場所に置く。`,
          ],
          [
            `chat-020-035`,
            `chat`,
            `0:20-0:35`,
            1220,
            `必要に応じて話題を振る：「おうちで英語の宿題はどうしていますか？」「園で好きな遊びを話してくれますか？」「休日のおすすめスポットはありますか？」`,
            `歓談の様子を見ながら、次の新聞紙じゃんけんの準備を始める。新聞紙を配布しやすい場所にまとめる。`,
          ],
          [
            `game-035`,
            `game`,
            `0:35`,
            2100,
            `「それでは、親子ミニゲームを始めます。Bearクラスは新聞紙じゃんけんです。親子で1組になってください。」`,
            `レジャーシートが邪魔になる場合は一部片付ける。新聞紙を1組1枚ずつ配る。`,
          ],
          [
            `game-036`,
            `game`,
            `0:36`,
            2160,
            `「新聞紙を広げて、その上に親子で立ってください。小さいお子さんは、保護者の方と一緒に安全に立ってくださいね。」`,
            `新聞紙同士の間隔を空ける。転びそうな場所がないか確認する。`,
          ],
          [
            `game-037`,
            `game`,
            `0:37`,
            2220,
            `「ルールを説明します。岸本さん（父）とじゃんけんをします。岸本さんに負けた親子は、新聞紙を半分に折ります。勝った人とあいこの人は、そのままです。」`,
            `岸本さん（父）をじゃんけん役として前へ誘導する。`,
          ],
          [
            `game-038`,
            `game`,
            `0:38`,
            2280,
            `「だんだん新聞紙が小さくなります。新聞紙から足が出たり、乗れなくなったら終了です。抱っこはOKですが、無理をしないでください。危ないと思ったら、自分たちでストップしてください。」`,
            `安全面を見守る。無理な抱っこ・片足立ちがあれば声をかける。`,
          ],
          [
            `game-039`,
            `game`,
            `0:39`,
            2340,
            `“We will play rock, paper, scissors with Kishimoto-san. If you lose, fold your newspaper in half. Please be careful and have fun!”`,
            ``,
          ],
          [
            `game-040`,
            `game`,
            `0:40`,
            2400,
            `「では練習です。Rock, paper, scissors! じゃんけんぽん！」`,
            `子どもがルールを理解しているか確認する。`,
          ],
          [
            `game-041`,
            `game`,
            `0:41`,
            2460,
            `「本番スタートです。岸本さんに負けた人は新聞紙を半分に折ってください。いきます、Rock, paper, scissors! じゃんけんぽん！」`,
            `負けた組が折れているかサポートする。`,
          ],
          [
            `game-042-050`,
            `game`,
            `0:42-0:50`,
            2520,
            `「まだ乗れていますか？無理はしないでくださいね。次いきます、Rock, paper, scissors! じゃんけんぽん！」を繰り返す。`,
            `危ない組がないか見る。脱落した組には「こちらで応援しましょう」と誘導する。`,
          ],
          [
            `game-050`,
            `game`,
            `0:50`,
            3000,
            `「残っている親子は何組でしょう？あと少しです！」`,
            `残り人数を数える。上位10組程度を把握する。`,
          ],
          [
            `game-052`,
            `game`,
            `0:52`,
            3120,
            `「ここで終了です！最後まで残った親子に拍手！」`,
            `上位10名に追加スタンプを渡す。10名に満たない場合は、残った子＋希望者じゃんけんで調整する。`,
          ],
          [
            `game-053`,
            `game`,
            `0:53`,
            3180,
            `「最後まで残ったお友だちは、スタンプをもらってください。みんな、とても上手でした！」`,
            `スタンプを押す。新聞紙を回収し、ゴミ袋へ入れる。`,
          ],
          [
            `closing-055`,
            `closing`,
            `0:55`,
            3300,
            `「皆さま、お時間となりました。本日は遠足後でお疲れのところ、最後までご参加いただきありがとうございました。」`,
            `ネームカード回収を始める。`,
          ],
          [
            `closing-056`,
            `closing`,
            `0:56`,
            3360,
            `「初めての企画で至らない点もあったかと思いますが、皆さまのご協力のおかげで楽しい時間になりました。ありがとうございます。」`,
            `ゴミ袋を持って周囲を回る。忘れ物がないか確認する。`,
          ],
          [
            `closing-057`,
            `closing`,
            `0:57`,
            3420,
            `「この後は自由解散です。引き続き公園で過ごされる方は、ケガや事故がないようお気をつけください。」`,
            `ネームカードの不足がないか確認する。`,
          ],
          [
            `closing-058`,
            `closing`,
            `0:58`,
            3480,
            `「ゴミはこちらで回収します。ネームカードも役員までご返却ください。」`,
            `回収漏れがあれば声かけする。`,
          ],
          [
            `closing-059`,
            `closing`,
            `0:59`,
            3540,
            `「それでは、本日はありがとうございました。今年度もどうぞよろしくお願いします！」`,
            `会長へ終了報告。ネームカードとゴミ袋を渡す。`,
          ],
        ],
        NOTES = [
          [
            `前提`,
            [
              `対象：Bear 3-4歳児クラス。親子で参加。`,
              `先生クイズは、英語で振ってから日本語で補足する。`,
              `クイズは7分で区切る。司会が時間を見ながら進め、遅れに役員が気づいた場合は合図する。`,
              `早起き以外は、Maiko先生・Miri先生・Nicole先生に1問ずつ平等に割り振る。`,
              `司会：堀田（父） / サポート係：堀田（母）、中渡さん / 歓談以降サポート：岸本さん、中渡さん、松尾さん、堀田（母）`,
            ],
          ],
          [
            `先生クイズ運用`,
            [
              `先生クイズの時間は司会が見ながら進める。遅れに役員が気づいた場合は、7分を目安に合図する。`,
              `4問すべて終わらなくても、7分になったら区切って先生コメントへ移る。`,
            ],
          ],
          [
            `先生コメント補足`,
            [
              `Maiko先生：お家での様子を教えてもらえると嬉しい。どんなことを楽しい・楽しかったと言っているかなど。`,
              `Miri先生：オープンでフレンドリーなコミュニケーション、家での小さな変化や様子の共有が助かる。`,
              `Nicole先生：お家でのお子さんの英語の様子をコミュニケーションノートに書いてもらえると嬉しい。`,
            ],
          ],
          [
            `当日確認`,
            [
              `新聞紙じゃんけんでは、親子の安全を最優先にする。無理な体勢は避けてもらう。`,
            ],
          ],
        ],
        L = [
          [`rem`, `残り`],
          [`over`, `超過`],
          [`delay`, `遅れ`],
          [`ahead`, `進み`],
          [`onTime`, `オンスケ`],
          [`next`, `次`],
          [`end`, `終了`],
        ],
        MEMO_BY_SECTION = {
          opening: [`スタンプカード配布と安全アナウンスを忘れずに。`],
          quiz: [
            `クイズは7分が目安。押したら区切って先生コメントへ。`,
            `移動時は走らないよう声かけする。`,
          ],
          comments: [
            `先生コメントは短くテンポよく進行する。`,
            `Maiko先生：お家での様子（楽しい・楽しかったこと等）を共有してもらえると嬉しい。`,
            `Miri先生：オープンでフレンドリーなコミュニケーション、家での小さな変化や様子の共有が助かる。`,
            `Nicole先生：お家でのお子さんの英語の様子をコミュニケーションノートに書いてもらえると嬉しい。`,
          ],
          chat: [`くじ引き・お菓子配布の動線を優先して確保する。`],
          game: [`新聞紙じゃんけんは安全第一。無理な体勢は止める。`],
          closing: [`ネームカードとゴミの回収漏れを最終確認する。`],
        };
      const GUIDE_STEPS = [
          { target: "#clock", title: "現在時刻", text: "画面左上に現在時刻を表示します。" },
          {
            target: "#pos",
            title: "台本全体表示",
            text: "中央ボタンで、進行カードと台本全体表示を切り替えできます。",
          },
          { target: "#prev", title: "前へ", text: "前の台本行に戻るときに使います。" },
          { target: "#next", title: "次へ", text: "次の台本行に進むときに使います。" },
        ],
        LT = Object.fromEntries(L),
        $ = (q) => document.querySelector(q),
        $$ = (q) => document.querySelectorAll(q),
        E = {
          clock: $("#clock"),
          bar: $("#bar"),
          sec: $("#sec"),
          meta: $("#meta"),
          curSec: $("#curSec"),
          curLabel: $("#curLabel"),
          lineRemain: $("#lineRemain"),
          host: $("#host"),
          support: $("#support"),
          supportBox: $("#supportBox"),
          memo: $("#memo"),
          memoBox: $("#memoBox"),
          q10: $("#q10"),
          run: $("#run"),
          tl: $("#tl"),
          prev: $("#prev"),
          next: $("#next"),
          pos: $("#pos"),
          guide: $("#guide"),
          guideBackdrop: $("#guideBackdrop"),
          guideHole: $("#guideHole"),
          guideStep: $("#guideStep"),
          guideTitle: $("#guideTitle"),
          guideText: $("#guideText"),
          guideSkip: $("#guideSkip"),
          guideNext: $("#guideNext"),
        };
      let st = load(),
        qt = null,
        qr = 0,
        guideStep = 0;
      function load() {
        let d = { i: 0, follow: 0, view: "run", guideSeen: 0 };
        try {
          let saved = Object.assign(d, JSON.parse(localStorage.getItem(KEY) || "{}"));
          if (!("guideSeen" in saved)) saved.guideSeen = 0;
          saved.follow = 0;
          return saved;
        } catch {
          return d;
        }
      }
      function save() {
        localStorage.setItem(KEY, JSON.stringify(st));
      }
      function parseRoute() {
        let hash = (location.hash || "").replace(/^#/, ""),
          [viewRaw, idxRaw] = hash.split("/");
        let view = viewRaw === "tl" ? "tl" : "run",
          i = Number.parseInt(idxRaw, 10);
        return { view, i: Number.isFinite(i) ? clamp(i, 0, DATA.length - 1) : null };
      }
      function syncRoute(replace = false) {
        let hash = "#" + st.view + "/" + st.i;
        if (location.hash === hash) return;
        if (replace) history.replaceState(null, "", hash);
        else history.pushState(null, "", hash);
      }
      function applyRoute() {
        let r = parseRoute();
        st.view = r.view;
        if (r.i !== null) st.i = r.i;
        save();
        render();
      }
      function clamp(v, min, max) {
        return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
      }
      function elapsed() {
        return Math.floor((Date.now() - baseTime().getTime()) / 1000);
      }
      function idx(t) {
        let x = 0;
        for (let i = 0; i < DATA.length && DATA[i][3] <= t; i++) x = i;
        return x;
      }
      function secById(id) {
        return SEC.find((s) => s[0] === id) || SEC[0];
      }
      function secByTime(t) {
        return SEC.find((s) => t >= s[3] && t < s[4]) || SEC[SEC.length - 1];
      }
      function pad(n) {
        return String(n).padStart(2, "0");
      }
      function clock(t) {
        return (
          Math.floor(t / 3600) +
          ":" +
          pad(Math.floor((t % 3600) / 60)) +
          ":" +
          pad(t % 60)
        );
      }
      function mm(t) {
        t = Math.max(0, Math.floor(t));
        return Math.floor(t / 60) + ":" + pad(t % 60);
      }
      function hm(t) {
        let x = new Date(baseTime().getTime() + Math.floor(t) * 1000);
        return pad(x.getHours()) + ":" + pad(x.getMinutes());
      }
      function hms(d) {
        return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
      }
      function baseTime() {
        let now = new Date();
        return new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          BASE_HOUR,
          BASE_MIN,
          0,
          0,
        );
      }
      function secRange(s) {
        return hm(s[3]) + "-" + hm(s[4]);
      }
      function status(delta) {
        if (Math.abs(delta) <= 5) return LT.onTime;
        return delta > 0 ? LT.delay + " +" + mm(delta) : LT.ahead + " -" + mm(-delta);
      }
      function esc(s) {
        return String(s)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
      }
      function fmt(s) {
        return esc(s).split("|").join("<br>");
      }
      function render() {
        let now = new Date(),
          tRaw = elapsed(),
          t = clamp(tRaw, 0, TOTAL),
          i = st.follow ? idx(t) : clamp(st.i, 0, DATA.length - 1);
        st.i = i;
        let d = DATA[i],
          s = secById(d[1]),
          cs = secByTime(t),
          nx = DATA[i + 1],
          remain = cs[4] - t,
          lineRemain = (nx ? nx[3] : cs[4]) - t,
          delta = tRaw - d[3];
        E.clock.value = hms(now);
        E.bar.style.width = Math.min(100, (t / TOTAL) * 100) + "%";
        E.sec.textContent = cs[1] + " (" + secRange(cs) + ")";
        E.meta.innerHTML =
          "<span>基準 " +
          hm(0) +
          " / " +
          (tRaw >= 0 ? "経過 " + clock(t) : "開始まで " + mm(-tRaw)) +
          "</span><span>" +
          "進行 " +
          status(delta) +
          "</span>";
        E.curSec.textContent = s[1];
        E.curLabel.textContent = hm(d[3]) + "（" + d[2] + "）";
        E.host.innerHTML = fmt(d[4]);
        E.support.innerHTML = d[5] ? fmt(d[5]) : " ";
        E.supportBox.hidden = !d[5];
        let memo = MEMO_BY_SECTION[d[1]] || [];
        E.memoBox.hidden = !memo.length;
        E.memo.innerHTML = memo.map((m) => "・" + esc(m)).join("<br>");
        E.lineRemain.textContent =
          (lineRemain >= 0 ? LT.rem : LT.over) + " " + mm(Math.abs(lineRemain));

        E.q10.hidden = d[1] !== "quiz";
        E.q10.textContent = qr > 0 ? "🕰️" + qr : "🕰️10";

        E.pos.textContent = i + 1 + " / " + DATA.length;
        E.prev.disabled = i === 0;
        E.next.disabled = i === DATA.length - 1;

        E.run.classList.toggle("on", st.view === "run");
        E.tl.classList.toggle("on", st.view === "tl");

        $$(".row").forEach((r) => {
          let n = +r.dataset.i;
          r.classList.toggle("on", n === i);
        });
      }
      function build() {
        E.tl.innerHTML = SEC.map(
          (s) =>
            "<section class=group><div class=gt><span>" +
            esc(s[1]) +
            "</span><span>" +
            secRange(s) +
            "</span></div>" +
            DATA.map((d, i) => [d, i])
              .filter((x) => x[0][1] === s[0])
              .map(
                (x) =>
                  "<button class=row data-i=" +
                  x[1] +
                  "><span class=time>" +
                  esc(hm(x[0][3])) +
                  "</span><span class=copy>" +
                  esc(x[0][4].split("|")[0]) +
                  "</span></button>",
              )
              .join("") +
            "</section>",
        ).join("");
      }
      function move(n) {
        st.i = clamp((st.follow ? idx(elapsed()) : st.i) + n, 0, DATA.length - 1);
        st.follow = 0;
        save();
        syncRoute();
        render();
      }
      function showGuide() {
        if (!GUIDE_STEPS.length) return;
        let step = GUIDE_STEPS[guideStep],
          target = step.target ? $(step.target) : null;
        E.guideStep.textContent = "使い方ガイド " + (guideStep + 1) + " / " + GUIDE_STEPS.length;
        E.guideTitle.textContent = step.title;
        E.guideText.textContent = step.text;
        E.guide.hidden = false;
        document.body.classList.add("guide-open");
        $$(".guide-target").forEach((el) => el.classList.remove("guide-target"));
        if (target) target.classList.add("guide-target");
        drawGuideHole(target);
        E.guideNext.textContent = guideStep === GUIDE_STEPS.length - 1 ? "はじめる" : "次へ";
      }
      function drawGuideHole(target) {
        if (!E.guideHole) return;
        if (!target) {
          E.guideHole.style.setProperty("--hole-left", "-9999px");
          E.guideHole.style.setProperty("--hole-top", "-9999px");
          return;
        }
        let r = target.getBoundingClientRect(),
          pad = 8;
        E.guideHole.style.setProperty("--hole-left", Math.max(0, r.left - pad) + "px");
        E.guideHole.style.setProperty("--hole-top", Math.max(0, r.top - pad) + "px");
        E.guideHole.style.setProperty("--hole-width", r.width + pad * 2 + "px");
        E.guideHole.style.setProperty("--hole-height", r.height + pad * 2 + "px");
      }
      function closeGuide() {
        E.guide.hidden = true;
        document.body.classList.remove("guide-open");
        $$(".guide-target").forEach((el) => el.classList.remove("guide-target"));
        st.guideSeen = 1;
        save();
      }
      function nextGuide() {
        guideStep++;
        if (guideStep >= GUIDE_STEPS.length) {
          closeGuide();
          return;
        }
        showGuide();
      }
      function quick(n) {
        clearInterval(qt);
        qr = n;
        render();
        qt = setInterval(() => {
          qr--;
          if (qr <= 0) {
            clearInterval(qt);
            qt = null;
            qr = 0;
            if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
          }
          render();
        }, 1000);
      }
      E.prev.onclick = () => move(-1);
      E.next.onclick = () => move(1);
      E.pos.onclick = () => {
        st.view = st.view === "run" ? "tl" : "run";
        save();
        syncRoute();
        render();
      };
      E.q10.onclick = () => quick(10);
      E.guideNext.onclick = () => nextGuide();
      E.guideSkip.onclick = () => closeGuide();
      E.guideBackdrop.onclick = () => nextGuide();
      E.tl.onclick = (e) => {
        let b = e.target.closest(".row");
        if (b) {
          st.i = +b.dataset.i;
          st.follow = 0;
          st.view = "run";
          save();
          syncRoute();
          render();
          scrollTo({ top: 0, behavior: "smooth" });
        }
      };
      let lastTouchEnd = 0;
      document.addEventListener(
        "touchend",
        (e) => {
          let now = Date.now();
          if (now - lastTouchEnd < 300) e.preventDefault();
          lastTouchEnd = now;
        },
        { passive: false },
      );
      window.addEventListener("hashchange", applyRoute);
      build();
      applyRoute();
      syncRoute(true);
      setInterval(() => {
        render();
      }, 500);
      render();
      if (!st.guideSeen) showGuide();
