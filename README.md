# Real-time collaborative document editor

This is a server and client for a real-time collaborative document editor. The implementation is as described in [this
paper](https://hal.inria.fr/inria-00071240/).

This is a toy and is not fully functional yet (e.g. documents aren't persistently stored and all clients start out with
an empty document). I wrote it with node and typescript, neither of which I have experience with. I don't recommend
using any of this as production/example code :)

Here's a gif of it in action:

![Gif of two documents](https://github.com/ryankaplan/collaborative-editing/blob/master/static/images/demo.gif?raw=true)

# Development setup

1. Get typescript compiling. I use WebStorm's integrated typescript compiler to compile files from /src to
    /static/compiled/js.
2. Run ./debug.sh which needs nodemon installed
