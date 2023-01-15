function getHeader(request, needle) {
    for (let header of request.responseHeaders) {
        if (header.name.toLowerCase() == needle) {
            return header.value;
        }
    }
}

function toLower(thing) {
    if (typeof thing === 'string') {
        return thing.toLowerCase();
    }
    else {
        return thing;
    }
}

let detectors = [
    {
        slug: 'cloudflare',
        name: 'Cloudflare',
        detect: (request) => {
            let header = getHeader(request, 'cf-ray');
            if (header) {
                const pop = header.slice(-3);
                return { pop };
            }
        }
    },
    {
        slug: 'cloudfront',
        name: 'Amazon CloudFront',
        detect: (request) => {
            let header = getHeader(request, 'x-amz-cf-pop');
            if (header) {
                const pop = header.slice(0, 3);
                return { pop };
            }
        }
    },
    {
        slug: 'stackpath',
        name: 'StackPath',
        detect: (request) => {
            let header = getHeader(request, 'x-hw');
            if (header) {
                const pops = header.split(',');
                const lastPop = pops[pops.length - 1];
                const parts = lastPop.split('.');
                const pop = parts[parts.length - 2];
                return { pop };
            }
        }
    },
    {
        slug: 'bunny',
        name: 'Bunny CDN',
        detect: (request) => {
            let header = getHeader(request, 'server');
            if (header && header.indexOf('BunnyCDN') == 0) {
                const pop = header.split('-')[1];
                return { pop };
            }
        }
    },
    {
        slug: 'cdn77',
        name: 'CDN77',
        detect: (request) => {
            let pop = getHeader(request, 'x-77-pop');
            if (pop) {
                return { pop };
            }
        }
    },
    {
        slug: 'fastly',
        name: 'Fastly',
        detect: (request) => {
            let server = toLower(getHeader(request, 'server'));
            let timer = getHeader(request, 'x-timer');
            let vary = getHeader(request, 'vary');
            if (server == 'artisanal bits' || /^s\d+\.\d+,vs0,ve\d+$/i.test(timer) || /fastly-ssl/i.test(vary)) {
                let pop = getHeader(request, 'x-served-by').slice(-3);
                return { pop };
            }
        }
    }
];

let cnameDetectors = [
    {
        slug: 'akamai',
        name: 'Akamai',
        domains: ['akamaiedge.net', 'akamai.net']
    }
];

function onRequest(details) {
    console.log(details);
    const tabId = details.tabId;
    if (tabId == -1) {
        return;
    }

    let cdnSlug;
    let cdnName;
    let pop;

    for (const detector of detectors) {
        let match = detector.detect(details);
        if (match) {
            cdnSlug = detector.slug;
            cdnName = detector.name;
            pop = match.pop;
        }
    }

    if (cdnSlug) {
        updateBadge(tabId, cdnSlug, cdnName, pop);
    }
    else {
        let hostname = new URL(details.url).hostname;
        browser.dns.resolve(hostname, ['canonical_name']).then(resp => {
            let canonicalName = resp['canonicalName'];
            console.log(`Resolved ${hostname} to CNAME ${canonicalName}`);

            for (const detector of cnameDetectors) {
                for (const domain of detector.domains) {
                    if (canonicalName.endsWith(domain)) {
                        updateBadge(tabId, detector.slug, detector.name, null);
                        return;
                    }
                }
            }
        });
    }
}

function updateBadge(tabId, cdnSlug, cdnName, pop) {
    browser.browserAction.setIcon({
        path: `icons/${cdnSlug}.png`,
        tabId: tabId,
    });

    if (pop) {
        pop = pop.toUpperCase();

        browser.browserAction.setBadgeText({
            text: pop,
            tabId: tabId,
        });
    }

    let title = cdnName;
    if (pop) {
        title += ` (${pop})`;
    }

    browser.browserAction.setTitle({ title, tabId });
}

browser.webRequest.onCompleted.addListener(
    onRequest, 
    {
        urls: ['<all_urls>'],
        types: ['main_frame']
    },
    ['responseHeaders']
);

browser.browserAction.setBadgeBackgroundColor({
    color: 'rgba(243, 128, 32, 0.5)',
});

browser.browserAction.setBadgeTextColor({
    color: '#fff',
});
