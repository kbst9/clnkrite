# Changelog

## v1.0-successpath

The section 1 success path is implemented:

1. Create a project; set BPM, key, vibe. Time signature defaults to 4/4.
2. Add a Music3 lane; generate via the local bridge; the clip lands on the armed lane at the playhead.
3. Import a vocal; overlay; nudge/move until it sits in sync.
4. Add a Synth lane and play a pattern.
5. Mute/solo lanes; select a set of lanes and play them together.
6. Drop a video on the Picture lane; the viewer is locked to the transport.
7. Hard-refresh: the project reloads from D1. IndexedDB is cache only.

Generate still needs the local GPU bridge. ACE-Step and Demucs explode use the same job machine.
