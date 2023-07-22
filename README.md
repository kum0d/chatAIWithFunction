# chatAIWithFunction
The program is used to create a virtual character by using ChatGPT. This is using langchain, pinecone and openai api.
You can chat with the character which is you designed.
This is working on cloudfare. You need to update the wrangler.toml to write your own api key.
# API Examples
To chat with the model: curl --request POST --url http://127.0.0.1:8787 --header 'Content-Type: application/json' --data '{ "questionJson": "hello"}'
