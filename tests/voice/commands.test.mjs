// 运行：node --test "tests/voice/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand, INTENTS } from "../../js/features/voice/commands.js";

const intentOf = (input) => parseCommand(input)?.intent ?? null;

const TABLE = {
    next: ["next track", "next song", "skip", "下一首", "下一曲", "切歌"],
    previous: ["previous track", "previous song", "go back", "上一首", "上一曲"],
    pause: ["pause", "stop", "暂停", "停止"],
    resume: ["resume", "play", "continue", "继续", "继续播放", "播放"],
};

test("exports the four intents", () => {
    assert.deepEqual(INTENTS, ["next", "previous", "pause", "resume"]);
});

test("every phrase in the table maps to its intent", () => {
    for (const [intent, phrases] of Object.entries(TABLE)) {
        for (const phrase of phrases) {
            assert.equal(intentOf(phrase), intent, phrase);
        }
    }
});

test("case, punctuation and whitespace are ignored", () => {
    assert.equal(intentOf("Next Track."), "next");
    assert.equal(intentOf("  PAUSE!  "), "pause");
    assert.equal(intentOf("Go back?"), "previous");
    assert.equal(intentOf("下一首。"), "next");
    assert.equal(intentOf("暂停！"), "pause");
    assert.equal(intentOf("继续 播放"), "resume");
    assert.equal(intentOf("next-song"), "next");
});

test("filler words are stripped", () => {
    assert.equal(intentOf("please pause"), "pause");
    assert.equal(intentOf("okay next song please"), "next");
    assert.equal(intentOf("could you play the music"), "resume");
    assert.equal(intentOf("the previous track"), "previous");
    assert.equal(intentOf("请暂停"), "pause");
    assert.equal(intentOf("帮我切歌吧"), "next");
    assert.equal(intentOf("麻烦继续播放一下"), "resume");
});

test("verb prefixes and song suffixes for track navigation", () => {
    assert.equal(intentOf("播放下一首"), "next");
    assert.equal(intentOf("放上一首"), "previous");
    assert.equal(intentOf("下一首歌"), "next");
    assert.equal(intentOf("上一首歌曲"), "previous");
    assert.equal(intentOf("play next song"), "next");
    assert.equal(intentOf("go to the previous song"), "previous");
});

test("near misses return null", () => {
    for (const text of [
        "next week",
        "next",
        "skip lunch",
        "play despacito",
        "stop the war",
        "continue reading",
        "pause and rewind",
        "go back home",
        "下一个",
        "暂停一首",
        "播放周杰伦",
        "继续努力",
        "上一首下一首",
    ]) {
        assert.equal(parseCommand(text), null, text);
    }
});

test("empty and invalid input return null", () => {
    for (const value of ["", "   ", "。！", null, undefined, 42, {}, []]) {
        assert.equal(parseCommand(value), null, String(value));
    }
});

test("unknown phrases return null", () => {
    assert.equal(parseCommand("what is the weather"), null);
    assert.equal(parseCommand("今天天气怎么样"), null);
});

test("alternatives: first recognisable candidate wins", () => {
    assert.deepEqual(parseCommand(["next week", "next track", "pause"]), { intent: "next", text: "next track" });
    assert.equal(intentOf(["今天天气", "暂停"]), "pause");
    assert.equal(parseCommand(["foo", "bar"]), null);
});

test("result carries the trimmed original text", () => {
    assert.deepEqual(parseCommand("  下一首。 "), { intent: "next", text: "下一首。" });
});
