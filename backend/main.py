import json
import random
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain.chains import ConversationChain, LLMChain
from langchain.memory import ConversationBufferMemory
from langchain.output_parsers import ResponseSchema, StructuredOutputParser
import logging
import yaml

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv('keys.env')
openai_api_key = os.environ['openai_api_key']

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variable to store personas data
personas_data = {}

def load_personas():
    global personas_data
    try:
        with open('personas.yaml', 'r', encoding='utf-8') as file:
            personas_data = yaml.safe_load(file)
        logger.info(f"Personas loaded successfully. Number of personas: {len(personas_data['personas'])}")
        logger.info(f"Loaded personas: {list(personas_data['personas'].keys())}")
    except Exception as e:
        logger.error(f"Error loading personas: {str(e)}")
        personas_data = {"personas": {}}

@app.on_event("startup")
async def startup_event():
    load_personas()
    logger.info("Application started, personas loaded.")

def get_all_persona_names():
    """Return all persona names from the loaded YAML file."""
    persona_names = list(personas_data['personas'].keys())
    logger.info(f"Available personas: {persona_names}")
    return persona_names

def get_persona_definition(persona_name):
    """Return a specific persona definition from the loaded YAML file."""
    persona = personas_data['personas'].get(persona_name, {
        "name": persona_name,
        "role": "Unknown",
        "background": "No background available"
    })

    logger.info(f"Retrieved persona: {persona_name}")
    logger.info(f"Persona keys: {persona.keys()}")
    
    # Add default values for missing keys
    persona['original_role'] = persona_name
    persona['core_expertise'] = persona.get('core_expertise', [])
    persona['cognitive_approach'] = persona.get('cognitive_approach', '')
    persona['values_and_motivations'] = persona.get('values_and_motivations', '')
    persona['communication_style'] = persona.get('communication_style', '')
    persona['notable_trait'] = persona.get('notable_trait', '')
    
    return persona

def validate_persona_selection(selected_personas):
    valid_personas = get_all_persona_names()
    validated_personas = []
    for persona in selected_personas:
        if persona in valid_personas:
            validated_personas.append(persona)
        else:
            logger.warning(f"Invalid persona selected: {persona}. Selecting a random valid persona instead.")
            validated_personas.append(random.choice(valid_personas))
    return validated_personas

class Question(BaseModel):
    text: str

def get_content(response):
    if isinstance(response, str):
        return response
    elif isinstance(response, dict) and "response" in response:
        return response["response"]
    elif isinstance(response, dict) and "output" in response:
        return response["output"]
    else:
        return str(response)

# Select Personas
@app.post("/select-personas")
async def select_personas(question: Question):
    try:
        logger.info(f"Selecting personas for question: {question.text}")
        
        available_personas = get_all_persona_names()
        logger.info(f"All available personas for selection: {available_personas}")

        chat = ChatOpenAI(temperature=0.5, openai_api_key=openai_api_key)

        response_schemas = [
            ResponseSchema(name="persona1", description="the most relevant persona selected to use to reason through the question"),
            ResponseSchema(name="persona2", description="the second most relevant persona selected to use to reason through the question"),
            ResponseSchema(name="persona3", description="the third most relevant persona selected to use to reason through the question"),
            ResponseSchema(name="rationale", description="a dictionary where keys are the selected persona names and values are the rationales for selecting each persona")
        ]
        output_parser = StructuredOutputParser.from_response_schemas(response_schemas)
        format_instructions = output_parser.get_format_instructions()
        format_instructions += "\nEnsure that the 'rationale' field is a dictionary with keys for each selected persona and corresponding rationale values." 

        persona_selection_prompt = PromptTemplate(
            input_variables=["question", "personas"],
            template="""
            Consider the following question with careful attention to its nuances and underlying themes.

            Question: {question}

            Carefully select 3 expert personas from the following list. Envision how their expertise can intertwine, forming a rich tapestry
            of interconnected knowledge and perspectives. Consider the depth and breadth each brings,
            and how their unique insights, when combined, could lead to groundbreaking explorations of the question.

            Available Personas: {personas}

            IMPORTANT: 
            1. Only select personas from the provided list. Do not invent or suggest new personas.
            2. You MUST provide a clear and specific rationale for EACH of the three selected personas.
            3. Your response MUST include a 'rationale' field that is a dictionary, where each key is a selected persona's name and the value is the rationale for selecting that persona.
            4. Failure to provide a rationale for each selected persona will result in an error and require reprocessing.


            {format_instructions}
            """,
            partial_variables={"format_instructions": format_instructions}
        )

        personas_string = ", ".join(available_personas)
        prompt_content = persona_selection_prompt.format(question=question.text, personas=personas_string)
        logger.info("Persona selection prompt content:")
        logger.info(prompt_content)

        chain = LLMChain(llm=chat, prompt=persona_selection_prompt)
        response = chain.run(question=question.text, personas=personas_string)

        logger.info(f"OpenAI API response: {response}")

        try:
            selection = output_parser.parse(response)
        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing error: {e}")
            logger.error(f"Problematic JSON: {response}")
            raise HTTPException(status_code=500, detail="Error parsing OpenAI response")

        logger.info(f"Parsed selection: {json.dumps(selection, indent=2)}")

        selected_personas = [selection['persona1'], selection['persona2'], selection['persona3']]
        validated_personas = validate_persona_selection(selected_personas)
        logger.info(f"Validated selected personas: {validated_personas}")

        selected_persona_definitions = [get_persona_definition(persona) for persona in validated_personas]
        logger.info(f"Selected persona definitions: {selected_persona_definitions}")

        rationales = selection.get('rationale', {})
        if not isinstance(rationales, dict):
            logger.error(f"Rationale is not a dictionary: {rationales}")
            rationales = {}

        missing_rationales = [p for p in validated_personas if p not in rationales]
        
        if missing_rationales:
            logger.warning(f"Missing rationales for: {missing_rationales}")
            
            # Make another API call to get missing rationales
            missing_rationale_prompt = PromptTemplate(
                input_variables=["question", "personas"],
                template="""
                For the following question: {question}
                
                Provide a clear and specific rationale for selecting each of these personas:
                {personas}
                
                Your response must be a dictionary where each key is a persona name and the value is the rationale.
                """
            )
            
            missing_rationale_chain = LLMChain(llm=chat, prompt=missing_rationale_prompt)
            missing_rationale_response = missing_rationale_chain.run(question=question.text, personas=", ".join(missing_rationales))
            
            try:
                additional_rationales = json.loads(missing_rationale_response)
                rationales.update(additional_rationales)
            except json.JSONDecodeError:
                logger.error(f"Error parsing additional rationales: {missing_rationale_response}")
                raise HTTPException(status_code=500, detail="Error generating complete rationales")

        logger.info(f"Final rationales: {json.dumps(rationales, indent=2)}")

        # Use these rationales when creating the result
        result = {
            "personas": [
                {
                    "name": persona.get('name', 'Unknown'),
                    "role": persona.get('role', 'Unknown'),
                    "background": persona.get('background', 'No background available'),
                    "core_expertise": persona.get('core_expertise', []),
                    "cognitive_approach": persona.get('cognitive_approach', ''),
                    "values_and_motivations": persona.get('values_and_motivations', ''),
                    "communication_style": persona.get('communication_style', ''),
                    "notable_trait": persona.get('notable_trait', ''),
                    "rationale": rationales.get(persona['original_role'], "Error: No rationale provided")
                }
                for persona in selected_persona_definitions
            ]
        }

        logger.info(f"Returning personas: {json.dumps(result, indent=2)}")
        return result

    except Exception as e:
        logger.error(f"Error occurred during persona selection: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# Improve Question
@app.post("/improve-question")
async def improve_question(request: dict):
    try:
        logger.info(f"Improving question: {request['text']}")
        
        question = request['text']
        personas = request['personas']
        
        # Format full persona definitions for the prompt
        persona_info = "\n\n".join([
            f"Name: {persona['name']}\n"
            f"Role: {persona['role']}\n"
            f"Background: {persona['background']}\n"
            f"Core Expertise: {', '.join(persona['core_expertise'])}\n"
            f"Cognitive Approach: {persona['cognitive_approach']}\n"
            f"Values and Motivations: {persona['values_and_motivations']}\n"
            f"Communication Style: {persona['communication_style']}\n"
            f"Notable Trait: {persona['notable_trait']}\n"
            f"Rationale for Selection: {persona['rationale']}"
            for persona in personas
        ])

        # Initialize ChatOpenAI model
        chat = ChatOpenAI(temperature=0.5,
                          openai_api_key=openai_api_key,
                          model='gpt-4o-mini')

        conversation = ConversationChain(
            llm=chat,
            memory=ConversationBufferMemory()
        )

        # Prompt 1: Brainstorm
        prompt_1_template = PromptTemplate(
            input_variables=["selected_personas", "question"],
            template="""
            You are a QuestionImprover reasoning agent using three unique, specified personas to reason collectively step by step to ultimately provide 
            the best possible quality improvement to a given question by arriving at a synthesized improved version of the question.

            To begin with, allow each persona to share their initial insights about the following question. 
            Detail your perspective, drawing on specific knowledge, experiences, and pioneering concepts from your field.
            Aim to uncover new angles and dimensions of the question, demonstrating how your unique expertise contributes 
            to a multifaceted understanding. In subsequent prompts, we'll engage in a collaborative process where these 
            perspectives are woven into an intricate network of thoughts. Later in the conversation, we'll highlight how 
            each viewpoint complements or challenges the others, constructing a more multidimensional and higher quality question 
            to pose back to the user who asked the initial question.

            The personas are:
            {selected_personas}

            The question is: {question}
            
            Please output each persona's individual initial response to the question on a new line.
            """
        )

        prompt_1 = prompt_1_template.format(selected_personas=persona_info, question=question)
        first = get_content(conversation.invoke(prompt_1))

        # Prompt 2: Self<>Peer Criticism
        prompt_2 = """
        Adopt a critical lens. Evaluate and challenge your own initial analysis and the analyses provided by your peers.
        As each expert, critically examine the collective insights thus far, aiming not just to critique but to enrich and expand upon them. 
        This process should delve into identifying underlying assumptions, potential biases, and areas where further exploration 
        could yield significant insights, thereby enhancing the collective understanding.
        """

        second = get_content(conversation.invoke(prompt_2))

        # Prompt 3: Self<>Peer Evaluation
        prompt_3 = """
        Reflect on the critiques received, and adapt your perspectives accordingly. 
        This prompt is about evolution and expansion of thought, where you reassess and reformulate ideas,
        creating a more nuanced and comprehensive network of interconnected ideas and insights in relation to the question.

        Prioritize assertions that are well-supported, constructive and resilient to scrutiny.
        """

        third = get_content(conversation.invoke(prompt_3))

        # Prompt 4: Expand, Explore, Branch, Network
        prompt_4 = """
        In this stage, weave a network of thoughts by integrating critiques and alternative perspectives.
        Focus on how new ideas can interconnect with and enhance existing thoughts. 
        Explore the potential of novel concepts to form new nodes in this thought network. 

        Push the boundaries of conventional thinking. Each persona explores new, divergent ideas, stimulated by the feedback loop. 
        Critically assess how these ideas not only address previous criticisms but also contribute fresh insights, 
        creating a richer and more intricate web of understanding, or introducing new dimensions to the question.
        Consider pivoting to new lines of reasoning that promise to add valuable connections to this evolving thought network.
        """

        fourth = get_content(conversation.invoke(prompt_4))

        # Prompt 5: Convergence on Best Individual Answer
        prompt_5 = f"""
        Now, it's time for each expert to finalize their thoughts and converge on a best answer. 
        Synthesize the insights and critiques into a coherent individual conclusion.

        Reflect on the entire dialogue, considering how each criticism was addressed and how your thoughts evolved. 
        Your answer should not only represent your strongest position but also acknowledge and integrate valid and useful
        insights from the other expert perspectives.
        
        Based on all this, as each expert, what is the single best answer to the initial question: {question}?

        Format the output with persona's name, title, and final answer.
        """

        fifth = get_content(conversation.invoke(prompt_5))

        # Prompt 6: Convergence on Best Collective Answer
        prompt_6 = """
        Facilitate a synthesis of the individual experts' answers to forge a unified, comprehensive response
        that combines the best elements from each persona's insights.
        This response should be a testament to the depth and complexity of the thought network, 
        showcasing how diverse perspectives can coalesce into a singular, insightful narrative.

        The synthesized answer should not be formulated in explicit terms specific to each persona's own definition or agenda, 
        but rather it should be phrased in a way that seeks to inspire and uncover broad, general, deeper truths, 
        regardless of what personas happened to be involved in this discussion. 
        A great answer will transcend the limited view of any one expert.
        """

        sixth = get_content(conversation.invoke(prompt_6))




        # Prompt 7: New Enhanced Question
        prompt_7 = f"""
        As we conclude our collaborative journey and after thorough analysis and reflection on the entire discussion,
        let's now focus on the final objective - to vastly elevate the original question into a more insightful and universally engaging form. 

        After going through the following thoughts, please take a deep breath and generate a far higher quality version of the original question.

        Reformulate the initial question by weaving in the rich insights gained through this networked reasoning process. 

        The new question should be deeper, clearer, and designed to catalyze more curiosity and invite more comprehensive exploration.

        Here are some thoughts to consider before you propose an improved version of the question:

        1. Clarify and Focus: Examine the original question's wording and structure.
         Refine it for clarity and focus, removing any ambiguities or vague terms.
        How can we make the question more precise and direct?

        2. Deepen the Inquiry: Expand the scope of the question to incorporate the key insights and perspectives that emerged during the discussion.
        How can the question be rephrased to encourage deeper exploration of these insights?
        Remove any unhelpful superficialities or false dichotomies present in the original question.

        3. Encourage Comprehensive Engagement: Modify the question to stimulate more comprehensive and thoughtful responses.
        Think about how the question can invite diverse relevant viewpoints and interdisciplinary thinking.

        4. Maintain Open-Endedness: Ensure that the revised question remains open-ended and thought-provoking.
        It should encourage a range of responses, facilitating a fruitful and ongoing discussion. 
        The improved question should not be re-formulated in terms specific to the persona's own definition or agenda, 
        but rather it should be phrased in a way that seeks to inspire and uncover broad, general, deeper truths, 
        regardless of what kinds people and personas explore this question in the future. 

        5. Reflect on Potential for Rich Dialogue: Contemplate the key aspects of the topic that could lead to richer dialogue.
        How can the question be framed to explore these aspects more thoroughly and inspirationally?

        As a reminder, the original question was {question}

        Please provide only the improved question in your response.
        """

        improved_question = get_content(conversation.invoke(prompt_7))
        logger.info(f"Improved question: {improved_question}")

        # Prompt 8: Summary of conversation, any major insights and turning points
        prompt_8 = """
        Provide a brief summary of this entire conversation so far, highlighting any major insights and/or turning points,
        if interesting to a curious human user who wants to read the conversation's evolution and highlights in just a paragraph.
        """
        
        eighth = get_content(conversation.invoke(prompt_8))
        logger.info(f"Conversation summary: {eighth}")

        # Prompt 9: Rationale for Refinement
        prompt_9 = """
        Generate a concise rationale for this refinement: briefly articulate why this new version is a 
        significantly higher quality and more effective question. 
        In contrast, include the most salient weaknesses or limitations in the way the original question was formulated.
        """

        ninth = get_content(conversation.invoke(prompt_9))
        logger.info(f"Rationale: {ninth}")

        # Harmony seeking loop
        prompt_10 = """
        Identify a fundamental principle that all personas can agree upon. 
        How did this shared foundation influence the collective reasoning process?
        """
        tenth = get_content(conversation.invoke(prompt_10))

        prompt_11 = """
        Using a synthesized perspective, help the person who asked the initial question to explore new and related dimensions:
        **Potential Exploration Pathways**: Offer possible directions or sub-questions for further exploration based on the enhanced question. This helps to spark more specific avenues of inquiry.
        **Further Reading/Resources**: Include links or references to relevant literature, articles, people of interest, or studies that can provide more context or information related to the enhanced question.
        """
        eleventh = get_content(conversation.invoke(prompt_11))

        # Return what's needed for the UI
        return {
            "improved_question": improved_question,
            "final_answer": sixth,
            "summary": eighth,
            "rationale": ninth,
            "harmony_principle": tenth,
            "new_dimensions": eleventh,
            "individual_answers": fifth
        }

    except Exception as e:
        logger.error(f"Error occurred: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/test")
async def test():
    return {"message": "Test successful"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)