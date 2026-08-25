import youtubeDl from "youtube-dl-exec";

async function test() {
    const opts = {
        dumpSingleJson: true,
        noWarnings: true,
        skipDownload: true,
        preferFreeFormats: true,
        forceIpv4: true,
        geoBypass: true,
    };
    
    try {
        const info = await youtubeDl(`ytsearch:her (feat. ZVC) JVKE`, opts);
        console.log(JSON.stringify(info, null, 2));
    } catch (e) {
        console.error(e);
    }
}

test();
