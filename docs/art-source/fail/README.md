# 失败结算页 · 仅新增资源

本包只包含两张新增图片：
- fail-title：箱子装满啦标题，透明背景。
- fail-hero：四只猫与纸箱的整体失败插画，含叹气符号，透明背景。

以上按效果图分别重绘，细节可能略有变化。PNG保持生成原图，WebP为质量90压缩版本；两种格式任选一套。

## 复用已有资源（本包不重复包含）
| 用途 | 复用已交付的成功页资源 |
| --- | --- |
| 游戏背景 | win-assets/png/game-background.png |
| 得分底板 | win-assets/png/win-score-panel.png |
| 再试一次按钮底图 | win-assets/png/win-button-replay.png |
| 返回首页按钮底图 | win-assets/png/win-button-home.png |

如使用WebP，复用同名webp文件即可。按钮文字由程序叠加，无需再做新按钮图片。

## 接入
叠放顺序：已有背景→fail-hero→fail-title→已有得分面板与按钮→程序文字。图片保持比例并按可见轮廓对齐，注意透明留白。分数取实际数据，副标题及按钮文案见texts.json。失败页不加载成功庆祝层；新纪录标识如需要，应由实际分数比较决定，示例默认隐藏。

两张新增图片是结算展示素材，不是单猫碰撞贴图。布局参考已生成失败页效果图。本包尚未接入原Cocos工程。
