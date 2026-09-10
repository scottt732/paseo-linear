# paseo-linear

A Paseo plugin that integrates Paseo with [Linear](https://linear.app), letting you search,
attach, and act on Linear issues directly from Paseo agent workspaces, and start Paseo agent
work from an issue without leaving your flow.

## Configuration

The plugin needs a Linear personal API key. Provide it either as `LINEAR_API_KEY` in the daemon
environment, or by entering it in Settings → Plugins → Linear.

## Installation

```bash
paseo plugin install /Users/sholodak/cosmos/paseo-linear
```

Source edits require a reload to take effect:

```bash
paseo plugin reload linear
```
