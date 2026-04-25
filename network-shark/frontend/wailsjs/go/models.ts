export namespace proxy {
	
	export class Cookie {
	    name: string;
	    value: string;
	    domain: string;
	    path: string;
	    httpOnly: boolean;
	    secure: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Cookie(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	        this.domain = source["domain"];
	        this.path = source["path"];
	        this.httpOnly = source["httpOnly"];
	        this.secure = source["secure"];
	    }
	}
	export class Timing {
	    queue: number;
	    dns: number;
	    connect: number;
	    ssl: number;
	    ttfb: number;
	    download: number;
	
	    static createFrom(source: any = {}) {
	        return new Timing(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.queue = source["queue"];
	        this.dns = source["dns"];
	        this.connect = source["connect"];
	        this.ssl = source["ssl"];
	        this.ttfb = source["ttfb"];
	        this.download = source["download"];
	    }
	}
	export class CapturedRequest {
	    id: string;
	    name: string;
	    url: string;
	    host: string;
	    path: string;
	    method: string;
	    type: string;
	    status: number;
	    statusText: string;
	    initiator: string;
	    size: number;
	    transferred: number;
	    duration: number;
	    timing: Timing;
	    requestHeaders: Record<string, string>;
	    responseHeaders: Record<string, string>;
	    mime: string;
	    failed: boolean;
	    startedAt: number;
	    finishedAt: number;
	    payload: string;
	    response: string;
	    cookies: Cookie[];
	
	    static createFrom(source: any = {}) {
	        return new CapturedRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.url = source["url"];
	        this.host = source["host"];
	        this.path = source["path"];
	        this.method = source["method"];
	        this.type = source["type"];
	        this.status = source["status"];
	        this.statusText = source["statusText"];
	        this.initiator = source["initiator"];
	        this.size = source["size"];
	        this.transferred = source["transferred"];
	        this.duration = source["duration"];
	        this.timing = this.convertValues(source["timing"], Timing);
	        this.requestHeaders = source["requestHeaders"];
	        this.responseHeaders = source["responseHeaders"];
	        this.mime = source["mime"];
	        this.failed = source["failed"];
	        this.startedAt = source["startedAt"];
	        this.finishedAt = source["finishedAt"];
	        this.payload = source["payload"];
	        this.response = source["response"];
	        this.cookies = this.convertValues(source["cookies"], Cookie);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

