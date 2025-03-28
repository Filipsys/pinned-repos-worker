import { parse } from "node-html-parser";
import type { GithubResponseJSON, ProjectData } from "../types";

const expireTime = 10 * 60 * 1000; // 10 minutes
let localCache: { [username: string]: { data: ProjectData[]; createdAt: number } } = {};

// Cache functions

const isInCache = (username: string) => {
	return Object.keys(localCache).includes(username);
};

const isExpired = (username: string) => {
	const currentTimestamp = new Date().getTime();

	return localCache[username].createdAt + expireTime < currentTimestamp;
};

// Main functions

const fetchHTML = async (username: string) => {
	const response = await fetch(`https://github.com/${username}`);
	if (!response.ok) return new Error("Request error");

	return await response.text();
};

const fetchPinnedReposFromAPI = async (username: string, repos: string[]): Promise<ProjectData[] | Error> => {
	if (repos.length === 0) return [];

	if (isInCache(username)) {
		if (!isExpired(username)) return localCache[username].data;

		delete localCache[username];
	}

	const response = await fetch(`https://api.github.com/users/${username}/repos`, {
		headers: { "User-Agent": username },
	});

	if (!response.ok) return new Error("Request error");
	const data = (await response.json()) as GithubResponseJSON;

	const newData: ProjectData[] = [];
	for (const project of data) {
		if (!repos.includes(project.name)) continue;

		newData.push({
			repoName: project.name,
			repoLink: project.html_url,
			repoDescription: project.description,
			isFork: project.fork,
			isTemplate: project.is_template,
			createdAt: project.created_at,
			lastUpdate: project.updated_at,
			mainLanguage: project.language,
			starAmount: project.stargazers_count,
			topics: project.topics,
		});
	}

	localCache[username] = { data: newData, createdAt: new Date().getTime() };
	return newData;
};

const getPinnedRepoNamesFromData = (rawHTML: string): string[] => {
	const output = parse(rawHTML).querySelectorAll(".pinned-item-list-item-content>div>div>span>a>span");

	return output.map((element) => element.innerText);
};

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname, searchParams } = new URL(request.url);

		const usernameParam = searchParams.get("u") || searchParams.get("user");
		if (pathname !== "/get" || !usernameParam) return new Response("Incorrect request", { status: 502 });

		const html = await fetchHTML(usernameParam);
		if (html instanceof Error) return new Response("Request error");

		const pinned = getPinnedRepoNamesFromData(html);
		const dataFromAPI = await fetchPinnedReposFromAPI(usernameParam, pinned);

		return new Response(JSON.stringify(dataFromAPI), {
			headers: { "Access-Control-Allow-Origin": "*" },
		});
	},
} satisfies ExportedHandler<Env>;
