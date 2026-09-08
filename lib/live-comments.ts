import type { World } from './world.ts';

type Topic = 'any' | 'pink' | 'water' | 'green' | 'light' | 'glass' | 'tall' | 'deep' | 'night' | 'day';
type Comment = { text: string; topic: Topic };
const line = (text: string, topic: Topic = 'any'): Comment => ({ text, topic });

export const RESIDENTS = [
  { name: 'こはる', comments: [line('遊びに来たよ！'), line('ここでのんびりしたいな'), line('さくら色がかわいい！', 'pink'), line('緑に囲まれてほっとするね', 'green'), line('夜の島もすてきだね', 'night')] },
  { name: 'そら', comments: [line('島めぐり、出発！'), line('次はどこを見ようかな'), line('高い建物から空が近そう！', 'tall'), line('下にも世界が広がってる！', 'deep'), line('昼の空にぴったりの島だね', 'day')] },
  { name: 'ひなた', comments: [line('みんなと来られてうれしい！'), line('お気に入りの場所を探そう'), line('水辺でひと休みしたいな', 'water'), line('緑がいっぱいで気持ちいい！', 'green'), line('あかりが目印になってるね', 'light')] },
  { name: 'ゆず', comments: [line('この島の雰囲気、好き！'), line('また散歩しに来たいな'), line('ピンクの組み合わせがいいね', 'pink'), line('ガラスの色がさわやか！', 'glass'), line('地下も探検してみたい！', 'deep')] },
  { name: 'みなと', comments: [line('おじゃまします！'), line('じっくり見て回りたいな'), line('水の青がきれいだね', 'water'), line('ずいぶん高く積んだね！', 'tall'), line('夜景を眺めていたいな', 'night')] },
  { name: 'あおい', comments: [line('ここで写真を撮りたい！'), line('いろんな角度から見たいな'), line('ガラスがいいアクセント！', 'glass'), line('緑のある景色っていいね', 'green'), line('明るい空によく映えるね', 'day')] },
  { name: 'りん', comments: [line('招待してくれてありがとう！'), line('細かいところも見ちゃうね'), line('星あかりを見つけた！', 'light'), line('さくら色でやさしい雰囲気！', 'pink'), line('島の下にも建てたんだね！', 'deep')] },
  { name: 'なぎ', comments: [line('ゆっくり過ごせそうだね'), line('ここ、落ち着くなあ'), line('水辺の景色に癒されるね', 'water'), line('静かな夜も似合うね', 'night'), line('見上げるほど高いね！', 'tall')] },
  { name: 'つむぎ', comments: [line('こだわりが伝わってくる！'), line('次の模様替えも楽しみ！'), line('あかりの配置がすてき！', 'light'), line('ガラスを使ってるんだね', 'glass'), line('下へ広げる発想、いいね！', 'deep')] },
  { name: 'れん', comments: [line('いい島に遊びに来た！'), line('またみんなで集まろう！'), line('高い建築、迫力あるね！', 'tall'), line('水のある島っていいな！', 'water'), line('昼のお散歩、最高！', 'day')] },
];

export type LiveComment = { name: string; text: string };
export function pickLiveComment(world: World, night: boolean, previous?: LiveComment, random = Math.random): LiveComment {
  const topics = new Set<Topic>(['any', night ? 'night' : 'day']);
  for (const block of world.blocks) {
    if (['pink', 'water', 'light', 'glass'].includes(block.material)) topics.add(block.material as Topic);
    if (block.material === 'grass' || block.material === 'leaf') topics.add('green');
    if (block.y >= 16) topics.add('tall');
    if (block.y < 0) topics.add('deep');
  }
  // Keep every resident eligible and avoid the same speaker twice in a row.
  const residents = RESIDENTS.filter((r) => r.name !== previous?.name);
  const resident = residents[Math.min(residents.length - 1, Math.floor(random() * residents.length))];
  const eligible = resident.comments.filter((c) => topics.has(c.topic));
  const weighted = eligible.flatMap((c) => c.topic === 'any' ? [c] : [c, c, c]);
  const comment = weighted[Math.min(weighted.length - 1, Math.floor(random() * weighted.length))];
  return { name: resident.name, text: comment.text };
}
