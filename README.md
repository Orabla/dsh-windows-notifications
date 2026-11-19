# Windows notifications for DeepSeek Harness

Six notification switches in the DeepSeek Harness settings window. The section uses the Host `Switch` and `Button` primitives and ships English and Simplified Chinese copy. It is a Windows port of `dsh-macos-notifications`; the delivery still goes through the Web Notification API, which Windows renders as a toast in the notification area and in Action Center.

[English](README.md) | [中文](README.zh.md)

## Install

Install the bundle from this repository:

```sh
dsh plugin --profile desktop add github:Orabla/dsh-windows-notifications
```

`--profile` takes the profile that runs your DSH instance, usually `desktop`. The command installs the package and registers the bundle in that profile.

You can also clone the repository and install the directory, or install a packed tarball:

```sh
dsh plugin --profile desktop add ./dsh-windows-notifications
```

Then enable **Windows notifications** in the settings window and allow notifications.

If toasts stay hidden, allow DeepSeek Harness under **Windows Settings** > **System** > **Notifications**, and turn off **Focus assist** or **Do not disturb**.

## Events

| Event             | Default |
| ----------------- | ------- |
| Approval waiting  | On      |
| Question for you  | On      |
| Task completed    | On      |
| Subtask completed | Off     |
| Task error        | On      |
| Turn completed    | Off     |

The Host stores these six booleans in `DSH_HOME/windows-notifications/settings.json`, or `~/.dsh/windows-notifications/settings.json` when `DSH_HOME` is unset. Changes apply immediately and survive a restart.

## Notification text

Turn on **Custom notification text** in the settings section to edit the toast yourself. Every kind gets its own template, and one title template covers the whole toast. The variables are:

| Variable    | Value                                                        |
| ----------- | ------------------------------------------------------------ |
| `{dot}`     | The status glyph of the event                                 |
| `{kind}`    | The event name in the current language                        |
| `{session}` | The session title                                             |
| `{detail}`  | The event detail, when the kind includes one                  |
| `{time}`    | The local time of the event                                    |

An empty template keeps the built-in text. The **Include the event detail** switch decides whether the kind adds its detail line:

| Kind             | Detail                                                      |
| ---------------- | ----------------------------------------------------------- |
| Approval waiting | The tool name and the reason the agent gave                  |
| Question         | The question text                                            |
| Task error       | The failure message                                          |
| Task completed   | The last assistant reply of the finished turn, on one line   |

A kind that carries a detail uses `{dot} {kind} · {detail}` as its built-in text, so a completed turn shows what the agent last said instead of a bare "task completed". The other kinds keep the click hint.

The Host never sends a detail the user did not enable.

## Behavior

Open the settings window and select the **Windows notifications** section. Press the permission button first, then the test button.

After permission is granted, the window reconnects the event stream with `ready=1`. Exactly one permitted window receives events at a time; when the receiving window disconnects, another window takes over. Notifications need an open DSH window that keeps its Host connection.

Clicking an event notification opens the matching session through `ctx.uiWorkspace.openSession`. The test notification only focuses the DSH window. Bodies carry the configured text; without a custom template they carry fixed copy and never the transcript or tool arguments.

## Build

Node.js 22 or newer.

```sh
node scripts/build-client.mjs
```

`scripts/build-client.mjs` assembles `lib/client.js` into a `window.__ModuleLoader__.load` factory named after the package. The factory requests React and DSH primitives from the existing client module table. The Host modules in `lib/` are plain ESM and need no build step.

## Limits

Focus assist, notification permissions, and app identity can suppress a toast after the system accepts the notification. A granted browser permission does not prove that Windows displays a toast. The test status distinguishes the submitted notification from the Notification API `show` event.
