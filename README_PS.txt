PSYS Hub Bundle
Generated: 2025-09-16T12:27:26.879103

Files:
- hub.html: 测试中心入口页面（建档/选人/开测/查看结果）。
- storage.js: 本地存储与团队隔离的数据层 API。
- *_linked.html: 在原文件基础上注入了 storage.js 与会话引导脚本（无侵入，支持 URL 参数或 Hub 进入）。

使用方式：
1) 打开 hub.html，创建团队与成员，从 Hub 进入 step1/2/3/4。Hub 会在 URL 上带上 teamId/userId/runId，页面自动建立安全会话。
2) 任一页面若无当前会话，将自动跳转回 hub.html，避免串台。
3) Dashboard 与 team_project_radar_updated 使用 *_linked.html 版本时，会话上下文保持一致，可确保团队只聚合同队未隐藏成员（聚合逻辑在 storage.js 提供，若要团队均值请在图表计算前调用 PSYS.aggregateTeam(meta.teamId)）。
4) 若需将现有页面的题目数据保存为 stepX：在保存按钮回调中调用：
   PSYS.saveStep('step1', data);
   计算结果保存：
   PSYS.saveComputed({structure, ecology, potentialA, potentialB}).

注意：由于未改动你原始题目与图表计算代码，保存数据的调用需要在各 step 的提交/计算处补上一行 PSYS.saveStep/PSYS.saveComputed（见上）。
