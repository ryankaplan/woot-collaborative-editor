# Real-time collaborative document editor

This is a server and client for a real-time collaborative document editor (aka a drastically simplified Google Docs). It's a prototype and not meant to be run in production. Also, it's written in node.js and Typescript, neither of which I had experience with when I built it.

My implementation is based on [this paper [1]](https://hal.inria.fr/inria-00071240/). Here's a GIF of it in action...

![Gif of two documents](https://github.com/ryankaplan/collaborative-editing/blob/master/static/images/demo.gif?raw=true)

# Running the code

1. Install npm by downloading and installing node.js from here: https://nodejs.org/en/
2. Run `npm install` in the repo's root directory
3. Run `$(npm bin)/jake build` to build the client and server
2. Run `node static/compiled/js/server.js` (yeah, it's wonky that server.js is in 'static')
3. Visit `localhost:3000` in a browser
4. Start typing!

# Project Status

I also don't plan to keep working on this. WOOT, as an approach, gets really slow unless you implement tombstone garbage collection (aka getting rid of text that users have deleted) which can only happen when everyone has disconnected from a document. I consider this an unacceptable user-experience for a collaborative document editor.

But there are lots of other ways to implement real-time collaborative editors! If you find this kind of stuff interesting and want to chat about it, [let's meet up](https://twitter.com/ryanjkaplan)!

If you're looking for something to use in production, I recommend [share.js](https://github.com/share/sharejs).

# Citations

1. Gérald Oster, Pascal Urso, Pascal Molli, Abdessamad Imine. Real time group editors without Operational transformation. [Research Report] RR-5580, INRIA. 2005, pp.24. <inria-00071240>
