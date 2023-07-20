import {
	ChatPromptTemplate,
	HumanMessagePromptTemplate,
	SystemMessagePromptTemplate,
} from "langchain/prompts";
import { LLMChain } from "langchain/chains";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { PineconeClient } from "@pinecone-database/pinecone";
import { VectorDBQAChain } from "langchain/chains";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { OpenAI } from "langchain/llms/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import { Configuration, OpenAIApi } from "openai";
import fetchAdapter from '@vespaiach/axios-fetch-adapter'
import { Document } from "langchain/document";
export default {
	async fetch(request, env, ctx) {
		if (request.method === 'OPTIONS') {
			return new Response('accept', {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST',
					'Access-Control-Allow-Headers': '*',
					'Access-Control-Max-Age': '600'
				},
			});
		}
		if (request.method != 'POST') {
			return new Response('Method not allowed', { status: 405 });
		}

		const contentType = request.headers.get('content-type');
		if (contentType == null || contentType == "" || !contentType.includes('application/json')) {
			return new Response('Invalid content-type', { status: 400 });
		}
		try {
			const data = await request.json();
			const question = data['questionJson'];
			if (question == null || question == "") {
				return new Response('Invalid value', { status: 400 });
			}
			console.log("start**************time:"+new Date());
			const result = await chatReply(env, question);
			console.log("end****************time:"+new Date());
			return new Response(JSON.stringify({ message: result }), {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Content-Type': 'application/json'
				},
			});
		} catch (error) {
			return new Response('Invalid JSON', { status: 400 });
		}
	},
};

async function chatReply(env, question) {

	const configuration = new Configuration({
		apiKey: env.OPENAI_API_KEY,
		baseOptions: {
			adapter: fetchAdapter
		}
	});
	const openai = new OpenAIApi(configuration);
	let result1, result2;

	try {
		result1 = await openai.createChatCompletion({
			model: "gpt-3.5-turbo-0613",
			messages: [{
				"role": "system", "content": "You are an idol. Your name is 香田メイ and you can reply with Chinese and English and Japanese.You need to chat as a real person.User will have a conversation with you, and you can call the function to get the reference if the conversation involves information of 香田メイ. If it is a normal chat do not call the function."
			},
			{ "role": "user", "content": "<conversation:" + question + "><NOTE: only answer the question, do not reply too much" }],
			functions: [{
				"name": "get_idol_information",
				"description": "Get the information of 香田メイ. If the conversation invloves information of 香田メイ",
				"parameters": {
					"type": "object",
					"properties": {
						"question": {
							"type": "string",
							"description": "a information of 香田メイ or a question for 香田メイ"
						},
						"unit": {
							"type": "string",
							"enum": ["celsius", "fahrenheit"]
						}
					},
					"required": ["question"]
				}
			}],
			function_call: "auto"
		});
	} catch (error) {
		console.log(error);
		return error;
	}
	try {
		let content = result1['data']['choices'][0]['message']['content'];
		if (content != null) {
			return content;
		}
		let questionToPineconeResponse = result1['data']['choices'][0]['message']['function_call']['arguments'];
		const questionToPineconeJson = JSON.parse(questionToPineconeResponse);
		const questionToPinecone = questionToPineconeJson['question'];
		console.log(questionToPinecone+"************time:"+new Date());
		let concatenatedPageContent = await queryData(env, questionToPinecone);
		result2 = await openai.createChatCompletion({
			model: "gpt-3.5-turbo-0613",
			messages: [{
				"role": "system", "content": "You are an idol. Your name is 香田メイ and you can reply with Chinese and English and Japanese.You need to chat as a real person. User will have a conversation with you." +
					"You have a reference. If the reference is not relevant to the conversation, you need to ignore the reference and do not mention the reference. Please reply naturally and colloquially. "
			},
			{ "role": "user", "content": "Reference:" + concatenatedPageContent }, { "role": "user", "content": "<question:" + question + "><NOTE: analysis the reference and only answer the question, do not reply too much" }]
		});
		return (result2['data']['choices'][0]['message']['content']);
	} catch (error) {
		console.log(error);
		return error;
	}
	return "error:system error";
}

async function queryData(env, questionToPinecone) {
	const pinecone = new PineconeClient();
	try {
		await pinecone.init({
			apiKey: env.PINECONE_API_KEY,
			environment: env.PINECONE_ENVIRONMENT,
		});
	} catch (error) {
		console.log(error);
		return error;
	}
	const index = pinecone.Index(env.PINECONE_INDEX);

	const queryEmbedding = await new OpenAIEmbeddings({ openAIApiKey: env.OPENAI_API_KEY }).embedQuery(questionToPinecone);
	let queryResponse;
	try {
		queryResponse = await index.query({
			queryRequest: {
				topK: 10,
				vector: queryEmbedding,
				includeMetadata: true,
				includeValues: true,
				namespace: "xiangtian",
			},
		});
	} catch (error) {
		console.log(error);
		return error;
	}
	let concatenatedPageContent = queryResponse.matches
		.map((match) => match.metadata.pageContent)
		.join(" ");

	return concatenatedPageContent;
}
