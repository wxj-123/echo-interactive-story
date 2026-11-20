/**
 * 《回声》剧情引擎类型定义
 *
 * 设计原则：剧情数据（story.json）与运行逻辑完全解耦。
 * 引擎是纯函数，不依赖 React，方便单测与校验脚本复用。
 */

/** 结局标识 */
export type EndingKey = 'yongye' | 'huisheng' | 'guihuan';

/** 剧情路线：隐瞒（独自查） / 坦白（与委托人合作） */
export type Route = 'hide' | 'tell';

/** 一句台词或旁白 */
export interface Line {
  /** 说话人；不填即为旁白 */
  speaker?: string;
  text: string;
  /** 排版语气：narrator=旁白(默认) / whisper=轻语 / system=机械提示 */
  tone?: 'narrator' | 'whisper' | 'system';
}

/** 固定选项 */
export interface Choice {
  id: string;
  text: string;
  /** 跳转目标节点 */
  next: string;
  /** 悬停提示，让玩家感知选择的重量 */
  hint?: string;
  effect?: Partial<Vars>;
}

/** 自由行动：玩家自己输入动作，由模型裁定 */
export interface FreeAction {
  /** 给玩家的提问 */
  prompt: string;
  placeholder: string;
  /** 快捷建议，降低输入门槛 */
  suggestions: string[];
  /**
   * 白名单：模型只允许把玩家导向这些节点。
   * 这是「模型不跑飞」的核心约束。
   */
  allowed: string[];
  /** 无 Key / 超时 / 校验不通过时的兜底目标 */
  fallback: string;
}

/** 条件跳转规则，按顺序取第一个命中的 */
export interface RouteRule {
  when: Condition;
  to: string;
}

export interface Condition {
  route?: Route;
  trustGte?: number;
  integrityGte?: number;
}

/** 剧情节点 */
export interface StoryNode {
  id: string;
  /** 章节标题，显示在画面左上角 */
  chapter: string;
  /** 场景标题 */
  title: string;
  /** 背景资源 key，对应 public/assets/bg/{bg}.jpg */
  bg: string;
  /** 缺图时的兜底色调 */
  bgTone?: 'warm' | 'cold' | 'dark';
  lines: Line[];
  choices?: Choice[];
  freeAction?: FreeAction;
  /** 进入节点时结算的变量 */
  effect?: Partial<Vars>;
  /** 无分支时的默认去向 */
  next?: string;
  /** 条件跳转，优先级高于 next */
  routes?: RouteRule[];
  /** 标记为结局节点 */
  ending?: { key: EndingKey; title: string; subtitle: string };
}

export interface StoryMeta {
  title: string;
  subtitle: string;
  start: string;
  version: string;
  /** 预计通关时长（分钟），用于 README 与结算页 */
  estimatedMinutes: number;
}

export interface Story {
  meta: StoryMeta;
  nodes: Record<string, StoryNode>;
}

/** 玩家状态变量 */
export interface Vars {
  /** 与委托人的信任 */
  trust: number;
  /** 记忆完整度（搜集到的碎片数） */
  integrity: number;
  /** 已走的路线 */
  route: Route | null;
  /** 自由行动次数 */
  freeActions: number;
  /** 选择轨迹，用于个性化结局 */
  choiceLog: string[];
}

/** 运行时状态 */
export interface GameState {
  nodeId: string;
  /** 当前显示到第几行 */
  lineIndex: number;
  vars: Vars;
  /** 走过的节点，用于进度条与结算 */
  history: string[];
  startedAt: number;
  finishedAt?: number;
  endingKey?: EndingKey;
}

export const START_VARS: Vars = {
  trust: 0,
  integrity: 0,
  route: null,
  freeActions: 0,
  choiceLog: [],
};
