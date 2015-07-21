# Real-time collaborative document editor

This is a server and client for a real-time collaborative document editor. The implementation is as described in [this
paper](https://hal.inria.fr/inria-00071240/).

This is a toy and is not fully functional yet (e.g. documents aren't persistently stored and all clients start out with
an empty document). I wrote it with node and typescript, neither of which I have experience with. I don't recommend
using any of this as production/example code :)

Here's a gif of it in action:

![Gif of two documents](https://github.com/ryankaplan/collaborative-editing/blob/master/static/images/demo.gif?raw=true)

# Running the code

1. Run `tsc -p src/client` to compile the client and `tsc -p src/server` to compile the server
2. Run `node static/compiled/js/server.js` (yeah, I know server.js shouldn't be in `static` :/)
3. Visit `localhost:3000` in a browser
4. Start typing!
