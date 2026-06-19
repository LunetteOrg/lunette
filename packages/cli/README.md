# @lntt/cli

**Status: planned — design discussion pending.**

The command-line dialect for [`@lntt/wire`](../wire): commands as flat
leaves over the chain's public surface, one `run` scope per invocation
(boot → command → teardown), where `lazy()` keeps unused infrastructure
from ever starting (`--help` should not open a database pool).
