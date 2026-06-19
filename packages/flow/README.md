# @lntt/flow

**Status: planned — design discussion pending.**

The orchestration dialect for [`@lntt/wire`](../wire): flows built from
bare leaves as nodes and events as edges, with sagas emerging from
sequences of per-call windows (each step commits its own work;
compensations are leaves too).
