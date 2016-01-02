# Real-time collaborative document editor

This is a server and client for a real-time collaborative
document editor. The implementation is as described in [this
paper [1]](https://hal.inria.fr/inria-00071240/).

This is a toy implementation - documents aren't persistently
stored and all clients start out with an empty document. I
wrote it with node and typescript, neither of which I have
experience with.

TL;DR Don't use any of this as production/example code :)

Below is a gif of it in action.

![Gif of two documents](https://github.com/ryankaplan/collaborative-editing/blob/master/static/images/demo.gif?raw=true)

# Running the code

1. Install npm by downloading and installing node.js from here: https://nodejs.org/en/
2. Run `npm install` in the repo's root directory
3. Run `$(npm bin)/jake build` to build the client and server
2. Run `node static/compiled/js/server.js` (yeah, it's wonky that server.js is in 'static')
3. Visit `localhost:3000` in a browser
4. Start typing!

# Project status

I also don't plan to keep working on this. WOOT, as an approach,
gets prohibitively slow without document garbage collection which
can only happen when all clients disconnect from a given document.
My [pattern-based-ot project](https://github.com/ryankaplan/pattern-based-ot)
is a WIP but is already a more robust implementation of a real-time
document editor than this editor.

If you're looking for something to use in production, I recomment
taking a look at [share.js](https://github.com/share/sharejs).

# Citations

1. Gérald Oster, Pascal Urso, Pascal Molli, Abdessamad Imine. Real time group editors without Operational transformation. [Research Report] RR-5580, INRIA. 2005, pp.24. <inria-00071240>