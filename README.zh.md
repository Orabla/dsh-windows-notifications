# 适用于 DeepSeek Harness 的 Windows 通知

在 DeepSeek Harness 的设置窗口中提供六类系统通知开关。该分区使用宿主 `Switch` 与 `Button` 组件，同时提供英文与简体中文文案。它是 `dsh-macos-notifications` 的 Windows 移植版；通知仍通过 Web Notification API 发送，由 Windows 显示为通知区和操作中心里的横幅。

[English](README.md) | 中文

## 安装

从本仓库安装该插件：

```sh
dsh plugin --profile desktop add github:Orabla/dsh-windows-notifications
```

`--profile` 填你实际运行 DSH 的 profile，通常是 `desktop`。该命令会安装软件包并把插件注册进这个 profile。

也可以克隆仓库后安装目录，或安装打包好的 tarball：

```sh
dsh plugin --profile desktop add ./dsh-windows-notifications
```

然后在设置窗口中启用 **Windows 通知** 并允许通知。

若横幅仍不显示，请在 **Windows 设置** > **系统** > **通知** 中允许 DeepSeek Harness，并关闭 **专注助手** 或 **请勿打扰**。

## 事件

| 事件       | 默认 |
| ---------- | ---- |
| 审批等待   | 开   |
| 向你提问   | 开   |
| 任务完成   | 开   |
| 子任务完成 | 关   |
| 任务出错   | 开   |
| 轮次完成   | 关   |

Host 把这六个布尔值存放在 `DSH_HOME/windows-notifications/settings.json`；没有 `DSH_HOME` 时使用 `~/.dsh/windows-notifications/settings.json`。修改立即生效，并在重启后保留。

## 通知文案

在设置分区打开 **自定义通知文案** 就可以自己改横幅。每一类事件有独立模板，通知标题有一个全局模板。可用变量：

| 变量       | 含义                     |
| ---------- | ------------------------ |
| `{dot}`    | 事件的状态圆点           |
| `{kind}`   | 当前语言下的事件名       |
| `{session}`| 会话标题                 |
| `{detail}` | 事件详情（该事件带详情时）|
| `{time}`   | 事件发生的本地时间       |

模板留空即使用内置文案。**附带事件详情** 开关决定该类事件是否追加详情行：

| 事件       | 详情                       |
| ---------- | -------------------------- |
| 审批等待   | 工具名与智能体给出的原因   |
| 向你提问   | 问题正文                   |
| 任务出错   | 失败信息                   |
| 任务完成   | 无，标题已是会话名         |

Host 不会发送你没有打开的详情。

## 行为

打开设置窗口，选择 **Windows 通知** 分区。请先按权限按钮，再按测试按钮。

授权成功后会以 `ready=1` 重连事件流。同一时刻只有一个获得权限的窗口接收事件；接收方断开后由另一个窗口接管。通知需要 DSH 窗口处于打开状态并保持 Host 连接。

点击事件通知会通过 `ctx.uiWorkspace.openSession` 打开对应会话。测试通知只聚焦 DSH 窗口。通知正文按配置的模板渲染，未自定义时使用固定文案，不包含对话正文或工具参数。

## 构建

需要 Node.js 22 或更高版本。

```sh
node scripts/build-client.mjs
```

`scripts/build-client.mjs` 把 `lib/client.js` 生成为以包名命名的 `window.__ModuleLoader__.load` 工厂。该工厂从既有客户端模块表请求 React 与 DSH 原生库。`lib/` 中的 Host 模块是普通 ESM，无需构建。

## 限制

专注助手、通知权限与应用标识可能在系统接受通知后仍然不显示横幅。浏览器权限状态不能证明 Windows 会显示横幅。测试状态区分的是「提交」与 Notification API 的 `show` 事件。
