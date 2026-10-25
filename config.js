// 云服务配置 —— 部署前请填写你自己的云服务信息
//
// 本项目后端使用 WorkBuddy 云服务（托管云数据库 + 用户认证 + RPC 函数）。
// 前端通过 window.PUBLIC_CONFIG 连接后端，两个值都可以在开通云服务后的 publicConfig 里找到。
//
// 1. 到 WorkBuddy 中为你的项目开通云服务（云数据库 / 用户认证 / SQL）；
// 2. 初始化数据表与服务端函数（见 README 的「后端初始化」一节）；
// 3. 把下面两个字段替换成你自己的 endpoint 与 publishableKey，保存即可。
window.PUBLIC_CONFIG = {
  endpoint: 'https://你的应用地址.app.workbuddy.host',
  publishableKey: 'wbpk_替换成你的公开密钥',
};
