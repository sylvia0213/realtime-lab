# Contributing

请先说明问题、期望行为和最小复现。修改保持聚焦，使用合成数据，不提交 token、个人数据或雇主代码。

1. Fork 仓库并创建分支。
2. 使用 `npm ci` 安装锁定版本。
3. 修改行为时补充能证明问题的测试；文案与样式变化无需机械增加测试。
4. 运行 `npm test` 和 `npm run build`；界面改动验证桌面、手机和键盘操作。
5. PR 描述写清变化、验证结果和已知限制。

计数术语保持精确：store 通知次数不等于 React 渲染/提交次数，配置发送速率不等于实测吞吐量。性能结论需要说明环境、负载和测量方式。

可以从下面的真实改进方向开始，但实现前先讨论范围：连接超时与半开连接检测、Worker 解析实验、连接恢复的快照协议、基于真实 React Profiler 的对照实验。

AI-assisted changes are welcome when the contributor understands and verifies the change. Please disclose substantial AI assistance in the PR description. Do not submit unverified generated claims or fabricated benchmark results.
