import { parse } from "node-html-parser";
import type { GithubResponseJSON, ProjectData, UserData } from "../types";

const fetchHTML = async (username: string): Promise<string> => {
	const response = await fetch(`https://github.com/${username}`, {
		headers: { "User-Agent": username },
	});

	return await response.text();
};

const fetchUserRepoCount = async (username: string): Promise<number> => {
	const userData = await fetch(`https://api.github.com/users/${username}`, {
		headers: { "User-Agent": username },
	});
	const data = await userData.json();

	return data["public_repos"];
};

const fetchPinnedReposFromAPI = async (username: string, repos: string[]): Promise<ProjectData[]> => {
	if (repos.length === 0) return [];

	const repoCount = await fetchUserRepoCount(username);
	const fetchedRepositories = [];

	for (let i = 1; i <= Math.ceil(repoCount / 30); i++) {
		const response = await fetch(`https://api.github.com/users/${username}/repos?page=${i}`, {
			headers: { "User-Agent": username },
		});
		const data = await response.json();

		for (const project of data) fetchedRepositories.push(project);
	}

	const newData: ProjectData[] = [];
	for (const project of fetchedRepositories) {
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
		const pinned = getPinnedRepoNamesFromData(html);
		const dataFromAPI = await fetchPinnedReposFromAPI(usernameParam, pinned);

		return new Response(JSON.stringify(dataFromAPI), {
			headers: { "Access-Control-Allow-Origin": "*" },
		});
	},
} satisfies ExportedHandler<Env>;
