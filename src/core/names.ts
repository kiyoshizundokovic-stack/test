import type { Rng } from './rng';
import type { PlayerName } from './types';

export const FAMILY_NAMES: readonly string[] = [
  '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
  '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水',
  '山崎', '森', '池田', '橋本', '阿部', '石川', '山下', '中島', '石井', '小川',
  '前田', '岡田', '長谷川', '藤田', '後藤', '近藤', '村上', '遠藤', '青木', '坂本',
  '斉藤', '福田', '太田', '西村', '藤井', '金子', '岡本', '藤原', '中野', '三浦',
  '原田', '中川', '松田', '竹内', '小野', '田村', '中山', '和田', '石田', '森田',
  '上田', '原', '柴田', '酒井', '工藤', '横山', '宮崎', '宮本', '内田', '高木',
];

export const GIVEN_NAMES: readonly string[] = [
  '翔太', '大輝', '拓海', '健太', '涼介', '直樹', '大地', '翼', '亮', '颯太',
  '悠斗', '蓮', '陽翔', '湊', '大和', '樹', '悠真', '隼人', '誠', '剛',
  '浩二', '達也', '和也', '智也', '哲也', '雄大', '勇気', '駿', '海斗', '陸',
  '晴人', '蒼', '慎吾', '修平', '恭平', '雅人', '光', '圭', '康介', '優斗',
  '一輝', '純平', '将大', '貴之', '尚人', '亮太', '良太', '翔', '航', '玲央',
];

export function fullName(name: PlayerName): string {
  return `${name.family} ${name.given}`;
}

/** 姓リスト・名リストからランダムに組み合わせて名前を作る */
export function generateName(rng: Rng): PlayerName {
  return { family: rng.pick(FAMILY_NAMES), given: rng.pick(GIVEN_NAMES) };
}

/**
 * 既存の名前と重複しない名前を作る（フルネーム単位）。
 * 組み合わせは 3500 通りあるので通常は数回で決まる。
 */
export function generateUniqueName(rng: Rng, taken: ReadonlySet<string>): PlayerName {
  for (let i = 0; i < 100; i++) {
    const name = generateName(rng);
    if (!taken.has(fullName(name))) return name;
  }
  return generateName(rng);
}
