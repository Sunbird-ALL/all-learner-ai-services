import { Controller, Get, Post, Body, Patch, Param, Delete, HttpStatus, Res, Search, Query } from '@nestjs/common';
import { ScoresService } from './scores.service';
import { CreateLearnerProfileDto } from './dto/CreateLearnerProfile.dto';
import { AssessmentInputDto } from './dto/AssessmentInput.dto';
import { FastifyReply } from 'fastify';
import { ApiBody, ApiExcludeEndpoint, ApiForbiddenResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { catchError, lastValueFrom, map } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { request } from 'http';

@ApiTags('scores')
@Controller('scores')
export class ScoresController {
  constructor(
    private readonly scoresService: ScoresService,
    private readonly httpService: HttpService
  ) { }

  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        original_text: { type: 'string', example: 'விமானம் வானில் பறக்கின்றது', description: "This will content text shown to user record" },
        audio: { type: 'string', example: 'Add tamil Wav file base64 string here', description: 'You can send .wav file or plain base64 string of wav file' },
        user_id: { type: 'string', example: '8635444062', description: 'This will generate from virtual service id service when user do login' },
        session_id: { type: 'string', example: '86354440621701972584385', description: 'This will generate from telemetry frontend lib when you do new login' },
        sub_session_id: { type: 'string', example: '86354440621701972584385', description: 'Use this sub session id if you want club recorded content within session' },
        language: { type: 'string', example: 'ta', description: 'This need to be send as per language. For this api, send ta for tamil' },
        date: {
          type: 'date', example: "2023-12-07T17:52:23.753Z"
        },
        contentId: { type: 'string', example: '5221f84c-8abb-4601-a9d0-f8d8dd496566', description: 'This content id will need to which is associated with original text' },
        contentType: { type: 'string', example: 'Sentence', description: 'Content type will be Char, Sentence, Word and Paragraph' }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Success message when data is stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while data is being stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({ summary: 'Store students learner ai profile, from the ASR output for a given wav file. This API will work for Tamil' })
  @Post('/updateLearnerProfile/ta')
  async updateLearnerProfileTa(@Res() response: FastifyReply, @Body() CreateLearnerProfileDto: CreateLearnerProfileDto) {
    try {
      let originalText = CreateLearnerProfileDto.original_text;
      let createScoreData;

      let correctTokens = [];
      let missingTokens = [];

      let vowelSignArr = [];

      let taVowelSignArr = [
        "ா",
        "ி",
        "ீ",
        "ு",
        "ூ",
        "ெ",
        "ே",
        "ை",
        "ொ",
        "ோ",
        "ௌ",
        "்",
      ];

      let language = "ta";
      vowelSignArr = taVowelSignArr;

      let responseText = '';
      let prevEle = '';
      let isPrevVowel = false;


      let originalTokenArr = [];
      let responseTokenArr = [];
      let constructTokenArr = [];

      // This code block used to create tamil compound consonents from text strings
      for (let originalTextELE of originalText.split("")) {
        if (originalTextELE != ' ') {
          if (vowelSignArr.includes(originalTextELE)) {
            if (isPrevVowel) {
              // let prevEleArr = prevEle.split("");
              // prevEle = prevEleArr[0] + originalTextELE;
              // originalTokenArr.push(prevEle);
            } else {
              prevEle = prevEle + originalTextELE;
              originalTokenArr.push(prevEle);
            }
            isPrevVowel = true;
          } else {
            originalTokenArr.push(originalTextELE);
            prevEle = originalTextELE;
            isPrevVowel = false;
          }
        }
      }

      /* Condition to check whether content type is char or not. If content type is char
      dont process it from ASR and other processing related with text evalution matrices and scoring mechanism
      */
      if (CreateLearnerProfileDto['contentType'].toLowerCase() !== "char") {
        let audioFile;

        if (CreateLearnerProfileDto['output'] === undefined && CreateLearnerProfileDto.audio !== undefined) {
          audioFile = CreateLearnerProfileDto.audio;
          const decoded = audioFile.toString('base64');

          // Send Audio file to ASR to process and provide vector with char and score
          let audioOutput = await this.scoresService.audioFileToAsrOutput(decoded, CreateLearnerProfileDto.language);
          CreateLearnerProfileDto['output'] = audioOutput.output;

          if (CreateLearnerProfileDto.output[0].source === "") {
            return response.status(HttpStatus.BAD_REQUEST).send({
              status: "error",
              message: "Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly"
            });
          }
        }

        let confidence_scoresArr = [];
        let missing_token_scoresArr = [];
        let anomaly_scoreArr = [];

        responseText = CreateLearnerProfileDto.output[0].source;
        let constructText = '';
        let originalTextTokensArr = originalText.split("");
        let responseTextTokensArr = responseText.split("");

        let originalTextArr = originalText.split(" ");
        let responseTextArr = responseText.split(" ");

        // Get All hexcode for this selected language
        let tokenHexcodeData = this.scoresService.gethexcodeMapping(language);
        let tokenHexcodeDataArr = [];

        await tokenHexcodeData.then((tokenHexcodedata: any) => {
          tokenHexcodeDataArr = tokenHexcodedata;
        });

        // Prepare Constructed Text
        let compareCharArr = [];

        let constructTextSet = new Set();

        let reptitionCount = 0;

        for (let originalEle of CreateLearnerProfileDto.original_text.split(" ")) {
          let originalRepCount = 0;
          for (let sourceEle of responseText.split(" ")) {
            let similarityScore = similarity(originalEle, sourceEle)
            if (similarityScore >= 0.40) {
              compareCharArr.push({ original_text: originalEle, response_text: sourceEle, score: similarity(originalEle, sourceEle) });
              //break;
            }
            if (similarityScore >= 0.60) {
              originalRepCount++;
            }
          }
          if (originalRepCount >= 2) {
            reptitionCount++;
          }
        }

        for (let compareCharArrEle of compareCharArr) {
          let score = 0;
          let word = '';
          for (let compareCharArrCmpEle of compareCharArr) {
            if (compareCharArrEle.original_text === compareCharArrCmpEle.original_text) {
              if (compareCharArrCmpEle.score > score) {
                score = compareCharArrCmpEle.score;
                word = compareCharArrCmpEle.response_text;
              }
            }
          }
          constructTextSet.add(word);
        }

        for (let constructTextSetEle of constructTextSet) {
          constructText += constructTextSetEle + ' ';
        }
        constructText = constructText.trim();

        function similarity(s1, s2) {
          var longer = s1;
          var shorter = s2;
          if (s1.length < s2.length) {
            longer = s2;
            shorter = s1;
          }
          var longerLength = longer.length;
          if (longerLength == 0) {
            return 1.0;
          }
          return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
        }

        function editDistance(s1, s2) {
          s1 = s1.toLowerCase();
          s2 = s2.toLowerCase();

          var costs = new Array();
          for (var i = 0; i <= s1.length; i++) {
            var lastValue = i;
            for (var j = 0; j <= s2.length; j++) {
              if (i == 0)
                costs[j] = j;
              else {
                if (j > 0) {
                  var newValue = costs[j - 1];
                  if (s1.charAt(i - 1) != s2.charAt(j - 1))
                    newValue = Math.min(Math.min(newValue, lastValue),
                      costs[j]) + 1;
                  costs[j - 1] = lastValue;
                  lastValue = newValue;
                }
              }
            }
            if (i > 0)
              costs[s2.length] = lastValue;
          }
          return costs[s2.length];
        }

        for (let constructTextELE of constructText.split("")) {
          if (constructTextELE != ' ') {
            if (vowelSignArr.includes(constructTextELE)) {
              if (isPrevVowel) {
                // let prevEleArr = prevEle.split("");
                // prevEle = prevEleArr[0] + responseTextELE;
                // responseTokenArr.push(prevEle);
              } else {
                prevEle = prevEle + constructTextELE;
                constructTokenArr.push(prevEle);
              }
              isPrevVowel = true;
            } else {
              constructTokenArr.push(constructTextELE);
              prevEle = constructTextELE;
              isPrevVowel = false;
            }
          }
        }

        // End Constructed Text Logic


        // Comparison Logic

        for (let originalTokenArrEle of originalTokenArr) {
          if (constructTokenArr.includes(originalTokenArrEle)) {
            correctTokens.push(originalTokenArrEle);
          } else {
            missingTokens.push(originalTokenArrEle);
          }
        }

        let missingTokenSet = new Set(missingTokens);

        missingTokens = Array.from(missingTokenSet)

        let filteredTokenArr = [];

        //token list for ai4bharat response
        let tokenArr = [];
        let anamolyTokenArr = [];

        // Create Single Array from AI4bharat tokens array
        CreateLearnerProfileDto.output[0].nBestTokens.forEach(element => {
          element.tokens.forEach(token => {
            let key = Object.keys(token)[0];
            let value = Object.values(token)[0];

            let insertObj = {};
            insertObj[key] = value;
            tokenArr.push(insertObj);

            let key1 = Object.keys(token)[1];
            let value1 = Object.values(token)[1];
            insertObj = {}
            insertObj[key1] = value1;
            anamolyTokenArr.push(insertObj);
          });
        });

        let uniqueChar = new Set();
        prevEle = '';
        isPrevVowel = false;

        // Create Unique token array
        for (let tokenArrEle of tokenArr) {
          let tokenString = Object.keys(tokenArrEle)[0];
          for (let keyEle of tokenString.split("")) {
            if (vowelSignArr.includes(keyEle)) {
              if (isPrevVowel) {
                let prevEleArr = prevEle.split("");
                prevEle = prevEleArr[0] + keyEle;
                uniqueChar.add(prevEle);
              } else {
                prevEle = prevEle + keyEle;
                uniqueChar.add(prevEle);
              }
              isPrevVowel = true;
            } else {
              uniqueChar.add(keyEle);
              isPrevVowel = false;
              prevEle = keyEle
            }
          }
        }

        //unique token list for ai4bharat response
        let uniqueCharArr = Array.from(uniqueChar);
        isPrevVowel = false;

        // Get best score for Each Char
        for (let char of uniqueCharArr) {
          let score = 0.0;
          let prevChar = '';
          let isPrevVowel = false;

          for (let tokenArrEle of tokenArr) {
            let tokenString = Object.keys(tokenArrEle)[0];
            let tokenValue = Object.values(tokenArrEle)[0];

            for (let keyEle of tokenString.split("")) {
              let scoreVal: any = tokenValue;
              let charEle: any = keyEle;

              if (vowelSignArr.includes(charEle)) {
                if (isPrevVowel) {
                  let prevCharArr = prevChar.split("");
                  prevChar = prevCharArr[0] + charEle;
                  charEle = prevChar;
                } else {
                  prevChar = prevChar + charEle;
                  charEle = prevChar;
                }
                isPrevVowel = true;
              } else {
                prevChar = charEle;
                isPrevVowel = false;
              }



              if (char === charEle) {
                if (scoreVal > score) {
                  score = scoreVal;
                }
              }
            }
          }

          filteredTokenArr.push({ charkey: char, charvalue: score });
        }

        // Create confidence score array and anomoly array
        for (let value of filteredTokenArr) {
          let score: any = value.charvalue

          let identification_status = 0;
          if (score >= 0.90) {
            identification_status = 1;
          } else if (score >= 0.40) {
            identification_status = -1;
          } else {
            identification_status = 0;
          }

          if (value.charkey !== "" && value.charkey !== "▁") {
            if (correctTokens.includes(value.charkey)) {
              let hexcode = getTokenHexcode(value.charkey);

              if (hexcode !== '') {
                confidence_scoresArr.push(
                  {
                    token: value.charkey,
                    hexcode: hexcode,
                    confidence_score: value.charvalue,
                    identification_status: identification_status
                  }
                );
              } else {
                if (!missingTokens.includes(value.charkey) && !constructTokenArr.includes(value.charkey)) {
                  anomaly_scoreArr.push(
                    {
                      token: value.charkey.replaceAll("_", ""),
                      hexcode: hexcode,
                      confidence_score: value.charvalue,
                      identification_status: identification_status
                    }
                  );
                }
              }
            }
          }
        }

        for (let missingTokensEle of missingTokenSet) {
          let hexcode = getTokenHexcode(missingTokensEle);

          if (hexcode !== '') {
            if (taVowelSignArr.includes(missingTokensEle)) { } else {
              if (!uniqueChar.has(missingTokensEle)) {
                missing_token_scoresArr.push(
                  {
                    token: missingTokensEle,
                    hexcode: hexcode,
                    confidence_score: 0.10,
                    identification_status: 0
                  }
                );
              }
            }
          }
        }

        for (let anamolyTokenArrEle of anamolyTokenArr) {
          let tokenString = Object.keys(anamolyTokenArrEle)[0];
          let tokenValue = Object.values(anamolyTokenArrEle)[0];

          if (tokenString != '') {
            let hexcode = getTokenHexcode(tokenString);
            if (hexcode !== '') {
              if (taVowelSignArr.includes(tokenString)) { } else {
                anomaly_scoreArr.push(
                  {
                    token: tokenString.replaceAll("_", ""),
                    hexcode: hexcode,
                    confidence_score: tokenValue,
                    identification_status: 0
                  }
                );
              }
            }

          }

        }

        const url = process.env.ALL_TEXT_EVAL_API;

        const textData = {
          "reference": CreateLearnerProfileDto.original_text,
          "hypothesis": CreateLearnerProfileDto.output[0].source,
          "language": "ta",
          "base64_string": audioFile.toString('base64')
        };

        const textEvalMatrices = await lastValueFrom(
          this.httpService.post(url, JSON.stringify(textData), {
            headers: {
              'Content-Type': 'application/json',
            }
          }).pipe(
            map((resp) => resp.data),
            catchError((error: AxiosError) => {
              throw 'Error from text Eval service' + error;
            }),
          )
        );

        let wer = textEvalMatrices.wer;
        let cercal = textEvalMatrices.cer * 2;
        let charCount = Math.abs(CreateLearnerProfileDto.original_text.length - CreateLearnerProfileDto.output[0].source.length);
        let wordCount = Math.abs(CreateLearnerProfileDto.original_text.split(' ').length - CreateLearnerProfileDto.output[0].source.split(' ').length);
        let repetitions = reptitionCount;
        let pauseCount = textEvalMatrices.pause_count;
        let ins = textEvalMatrices.insertion.length;
        let del = textEvalMatrices.deletion.length;
        let sub = textEvalMatrices.substitution.length;

        let fluencyScore = ((wer * 5) + (cercal * 10) + (charCount * 10) + (wordCount * 10) + (repetitions * 10) + (pauseCount * 10) + (ins * 20) + (del * 15) + (sub * 5)) / 100;

        let createdAt = new Date().toISOString().replace('Z', '+00:00')

        createScoreData = {
          user_id: CreateLearnerProfileDto.user_id, // userid sent by client
          session: {
            session_id: CreateLearnerProfileDto.session_id, // working logged in session id
            sub_session_id: CreateLearnerProfileDto.sub_session_id || "", // used to club set recorded data within session
            contentType: CreateLearnerProfileDto.contentType, // contentType could be Char, Word, Sentence and Paragraph
            contentId: CreateLearnerProfileDto.contentId || "", // contentId of original text content shown to user to speak
            createdAt: createdAt,
            language: language, // content language
            original_text: CreateLearnerProfileDto.original_text, // content text shown to speak
            response_text: responseText, // text return by ai after converting audio to text
            construct_text: constructText, // this will be constructed by matching response text with original text.
            confidence_scores: confidence_scoresArr, // confidence score array will include char's has identified by ai and has score
            anamolydata_scores: anomaly_scoreArr, // this char's recognise as noise in audio
            missing_token_scores: missing_token_scoresArr, // this char's missed to spoke or recognise by ai
            error_rate: {
              character: textEvalMatrices.cer,
              word: textEvalMatrices.wer
            },
            count_diff: {
              character: Math.abs(CreateLearnerProfileDto.original_text.length - CreateLearnerProfileDto.output[0].source.length),
              word: Math.abs(CreateLearnerProfileDto.original_text.split(' ').length - CreateLearnerProfileDto.output[0].source.split(' ').length)
            },
            eucledian_distance: {
              insertions: {
                chars: textEvalMatrices.insertion,
                count: textEvalMatrices.insertion.length
              },
              deletions: {
                chars: textEvalMatrices.deletion,
                count: textEvalMatrices.deletion.length
              },
              substitutions: {
                chars: textEvalMatrices.substitution,
                count: textEvalMatrices.substitution.length
              }
            },
            fluencyScore: fluencyScore.toFixed(3),
            silence_Pause: {
              total_duration: 0,
              count: textEvalMatrices.pause_count,
            },
            reptitionsCount: reptitionCount,
            asrOutput: JSON.stringify(CreateLearnerProfileDto.output)
          }
        };

        // Store Array to DB
        let data = this.scoresService.create(createScoreData);

        function getTokenHexcode(token: string) {
          let result = tokenHexcodeDataArr.find(item => item.token === token);
          return result?.hexcode || '';
        }
      }

      return response.status(HttpStatus.CREATED).send({ status: 'success', msg: "Successfully stored data to learner profile", responseText: responseText, createScoreData: createScoreData })
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        original_text: { type: 'string', example: 'आपसे मिलकर अच्छा लगा', description: "This will content text shown to user record" },
        audio: { type: 'string', example: 'Add hindi Wav file base64 string here', description: 'You can send .wav file or plain base64 string of wav file' },
        user_id: { type: 'string', example: '1390074473', description: 'This will generate from virtual service id service when user do login' },
        session_id: { type: 'string', example: '13900744731701973109305', description: 'This will generate from telemetry frontend lib when you do new login' },
        language: { type: 'string', example: 'hi', description: 'This need to be send as per language. For this api, send hi for hindi' },
        date: {
          type: 'date', example: "2023-12-07T17:52:23.753Z"
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Success message when data is stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while data is being stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({ summary: 'Store students learner ai profile, from the ASR output for a given wav file. This API will work for Hindi' })
  @Post('/updateLearnerProfile/hi')
  async updateLearnerProfileHi(@Res() response: FastifyReply, @Body() CreateLearnerProfileDto: CreateLearnerProfileDto) {
    try {
      if (CreateLearnerProfileDto['output'] === undefined && CreateLearnerProfileDto.audio !== undefined) {
        let audioFile = CreateLearnerProfileDto.audio;
        const decoded = audioFile.toString('base64');
        let audioOutput = await this.scoresService.audioFileToAsrOutput(decoded, "hi");
        CreateLearnerProfileDto['output'] = audioOutput.output;

        if (CreateLearnerProfileDto.output[0].source === "") {
          return response.status(HttpStatus.BAD_REQUEST).send({
            status: "error",
            message: "Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly"
          });
        }

      }

      let confidence_scoresArr = [];
      let anomaly_scoreArr = [];
      let missing_token_scoresArr = [];

      let originalText = CreateLearnerProfileDto.original_text;
      let responseText = CreateLearnerProfileDto.output[0].source;
      let originalTextTokensArr = originalText.split("");
      let responseTextTokensArr = responseText.split("");

      let correctTokens = [];
      let missingTokens = [];

      let hindiVowelSignArr = ["ा", "ि", "ी", "ु", "ू", "ृ", "े", "ै", "ो", "ौ", "ं", "ः", "ँ", "ॉ", "ों", "्", "़", "़ा"];

      let vowelSignArr = [];

      let language = "hi";


      vowelSignArr = hindiVowelSignArr;

      let tokenHexcodeData = this.scoresService.gethexcodeMapping(language);
      let tokenHexcodeDataArr = [];

      await tokenHexcodeData.then((tokenHexcodedata: any) => {
        tokenHexcodeDataArr = tokenHexcodedata;
      });

      let prevEle = '';
      let isPrevVowel = false;


      let originalTokenArr = [];
      let responseTokenArr = [];


      for (let originalTextELE of originalText.split("")) {
        if (originalTextELE != ' ') {
          if (vowelSignArr.includes(originalTextELE)) {
            if (isPrevVowel) {
              prevEle = prevEle + originalTextELE;
              originalTokenArr.push(prevEle);
            } else {
              prevEle = prevEle + originalTextELE;
              originalTokenArr.push(prevEle);
            }
            isPrevVowel = true;
          } else {
            originalTokenArr.push(originalTextELE);
            prevEle = originalTextELE;
            isPrevVowel = false;
          }
        }
      }

      for (let responseTextELE of responseText.split("")) {
        if (responseTextELE != ' ') {
          if (vowelSignArr.includes(responseTextELE)) {
            if (isPrevVowel) {
              prevEle = prevEle + responseTextELE;
              responseTokenArr.push(prevEle);
            } else {
              prevEle = prevEle + responseTextELE;
              responseTokenArr.push(prevEle);
            }
            isPrevVowel = true;
          } else {
            responseTokenArr.push(responseTextELE);
            prevEle = responseTextELE;
            isPrevVowel = false;
          }
        }
      }


      // Comparison Logic

      for (let originalTokenArrEle of originalTokenArr) {
        if (responseTokenArr.includes(originalTokenArrEle)) {
          correctTokens.push(originalTokenArrEle);
        } else {
          missingTokens.push(originalTokenArrEle);
        }
      }

      let missingTokenSet = new Set(missingTokens);

      missingTokens = Array.from(missingTokenSet)

      let filteredTokenArr = [];

      //token list for ai4bharat response
      let tokenArr = [];
      let anamolyTokenArr = [];

      // Create Single Array from AI4bharat tokens array
      CreateLearnerProfileDto.output[0].nBestTokens.forEach(element => {
        element.tokens.forEach(token => {
          let key = Object.keys(token)[0];
          let value = Object.values(token)[0];

          let insertObj = {};
          insertObj[key] = value;
          tokenArr.push(insertObj);

          let key1 = Object.keys(token)[1];
          let value1 = Object.values(token)[1];
          insertObj = {}
          insertObj[key1] = value1;
          anamolyTokenArr.push(insertObj);
        });
      });

      let uniqueChar = new Set();
      prevEle = '';
      isPrevVowel = false;

      // Create Unique token array
      for (let tokenArrEle of tokenArr) {
        let tokenString = Object.keys(tokenArrEle)[0];
        for (let keyEle of tokenString.split("")) {
          if (vowelSignArr.includes(keyEle)) {
            if (isPrevVowel) {
              prevEle = prevEle + keyEle;
              uniqueChar.add(prevEle);
            } else {
              prevEle = prevEle + keyEle;
              uniqueChar.add(prevEle);
            }
            isPrevVowel = true;
          } else {
            uniqueChar.add(keyEle);
            isPrevVowel = false;
            prevEle = keyEle
          }
        }
      }

      //unique token list for ai4bharat response
      let uniqueCharArr = Array.from(uniqueChar);

      //console.log(uniqueCharArr);

      isPrevVowel = false;

      // Get best score for Each Char
      for (let char of uniqueCharArr) {
        let score = 0.0;
        let prevChar = '';
        let isPrevVowel = false;

        for (let tokenArrEle of tokenArr) {
          let tokenString = Object.keys(tokenArrEle)[0];
          let tokenValue = Object.values(tokenArrEle)[0];

          for (let keyEle of tokenString.split("")) {
            let scoreVal: any = tokenValue;
            let charEle: any = keyEle;

            if (vowelSignArr.includes(charEle)) {
              if (isPrevVowel) {
                prevChar = prevChar + charEle;
                charEle = prevChar;
              } else {
                prevChar = prevChar + charEle;
                charEle = prevChar;
              }
              isPrevVowel = true;
            } else {
              prevChar = charEle;
              isPrevVowel = false;
            }



            if (char === charEle) {
              if (scoreVal > score) {
                score = scoreVal;
              }
            }
          }
        }

        filteredTokenArr.push({ charkey: char, charvalue: score });
      }

      //console.log(filteredTokenArr);

      // Create confidence score array and anomoly array
      for (let value of filteredTokenArr) {
        let score: any = value.charvalue

        let identification_status = 0;

        if (score >= 0.90) {
          identification_status = 1;
        } else if (score >= 0.40) {
          identification_status = -1;
        }

        if (value.charkey !== "" && value.charkey !== "▁") {
          if (correctTokens.includes(value.charkey) || originalTokenArr.includes(value.charkey)) {
            let hexcode = getTokenHexcode(value.charkey);

            if (hexcode !== '') {
              confidence_scoresArr.push(
                {
                  token: value.charkey,
                  hexcode: hexcode,
                  confidence_score: value.charvalue,
                  identification_status: identification_status
                }
              );
            } else {
              anomaly_scoreArr.push(
                {
                  token: value.charkey.replaceAll("_", ""),
                  hexcode: hexcode,
                  confidence_score: value.charvalue,
                  identification_status: identification_status
                }
              );
            }
          }
        }
      }

      for (let missingTokensEle of missingTokens) {
        let hexcode = getTokenHexcode(missingTokensEle);

        if (hexcode !== '') {
          if (hindiVowelSignArr.includes(missingTokensEle)) { } else {
            if (!uniqueChar.has(missingTokensEle)) {
              missing_token_scoresArr.push(
                {
                  token: missingTokensEle,
                  hexcode: hexcode,
                  confidence_score: 0.10,
                  identification_status: 0
                }
              );
            }
          }
        }
      }

      for (let anamolyTokenArrEle of anamolyTokenArr) {
        let tokenString = Object.keys(anamolyTokenArrEle)[0];
        let tokenValue = Object.values(anamolyTokenArrEle)[0];

        if (tokenString != '') {
          let hexcode = getTokenHexcode(tokenString);
          if (hexcode !== '') {
            if (hindiVowelSignArr.includes(tokenString)) { } else {
              anomaly_scoreArr.push(
                {
                  token: tokenString.replaceAll("_", ""),
                  hexcode: hexcode,
                  confidence_score: tokenValue,
                  identification_status: 0
                }
              );
            }
          }

        }

      }

      let createdAt = new Date().toISOString().replace('Z', '+00:00');

      let createScoreData = {
        user_id: CreateLearnerProfileDto.user_id,
        session: {
          session_id: CreateLearnerProfileDto.session_id,
          createdAt: createdAt,
          language: language,
          original_text: CreateLearnerProfileDto.original_text,
          response_text: responseText,
          confidence_scores: confidence_scoresArr,
          missing_token_scores: missing_token_scoresArr,
          anamolydata_scores: anomaly_scoreArr
        }
      };

      // Store Array to DB
      let data = this.scoresService.create(createScoreData);

      function getTokenHexcode(token: string) {
        let result = tokenHexcodeDataArr.find(item => item.token === token);
        return result?.hexcode || '';
      }

      return response.status(HttpStatus.CREATED).send({ status: 'success', msg: "Successfully stored data to learner profile", responseText: responseText })
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        original_text: { type: 'string', example: 'ಆಕಾಶನ ಮನೆಯು ಅಂಗಡಿಯ ಹತ್ತಿರ ಇದೆ', description: "This will content text shown to user record" },
        audio: { type: 'string', example: 'Add kannada Wav file base64 string here', description: 'You can send .wav file or plain base64 string of wav file' },
        user_id: { type: 'string', example: '8550552703', description: 'This will generate from virtual service id service when user do login' },
        session_id: { type: 'string', example: '85505527031701973332940', description: 'This will generate from telemetry frontend lib when you do new login' },
        language: { type: 'string', example: 'kn', description: 'This need to be send as per language. For this api, send kn for kannada' },
        date: {
          type: 'date', example: "2023-12-07T17:52:23.753Z"
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Success message when data is stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while data is being stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({ summary: 'Store students learner ai profile, from the ASR output for a given wav file. This API will work for Kannada' })
  @Post('/updateLearnerProfile/kn')
  async updateLearnerProfileKn(@Res() response: FastifyReply, @Body() CreateLearnerProfileDto: CreateLearnerProfileDto) {
    try {

      let confidence_scoresArr = [];
      let anomaly_scoreArr = [];
      let missing_token_scoresArr = [];
      let correctTokens = [];
      let missingTokens = [];
      let vowelSignArr = [];
      let originalTokenArr = [];
      let responseTokenArr = [];
      let constructTokenArr = [];

      let language = "kn";

      let originalText = CreateLearnerProfileDto.original_text;
      let originalTextTokensArr = originalText.split("");

      let kannadaVowelSignArr = ["ಾ", "ಿ", "ೀ", "ು", "ೂ", "ೃ", "ೆ", "ೇ", "ೈ", "ೊ", "ೋ", "ೌ", "ಂ", "ಃ", "ೄ", "್", "ಀ", "ಁ", "಼"];
      vowelSignArr = kannadaVowelSignArr;

      let responseText = "";

      let prevEle = '';
      let isPrevVowel = false;
      let createScoreData: any;

      if (CreateLearnerProfileDto['contentType'].toLowerCase() !== "char") {
        let audioFile;
        if (CreateLearnerProfileDto['output'] === undefined && CreateLearnerProfileDto.audio !== undefined) {
          audioFile = CreateLearnerProfileDto.audio;
          const decoded = audioFile.toString('base64');
          let audioOutput = await this.scoresService.audioFileToAsrOutput(decoded, "kn");
          CreateLearnerProfileDto['output'] = audioOutput.output;

          if (CreateLearnerProfileDto.output[0].source === "") {
            return response.status(HttpStatus.BAD_REQUEST).send({
              status: "error",
              message: "Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly"
            });
          }
        }

        responseText = CreateLearnerProfileDto.output[0].source;
        let responseTextTokensArr = responseText.split("");

        let constructText = '';

        let tokenHexcodeData = this.scoresService.gethexcodeMapping(language);
        let tokenHexcodeDataArr = [];

        await tokenHexcodeData.then((tokenHexcodedata: any) => {
          tokenHexcodeDataArr = tokenHexcodedata;
        });

        // Prepare Constructed Text
        let compareCharArr = [];

        let constructTextSet = new Set();

        let reptitionCount = 0;

        for (let originalEle of CreateLearnerProfileDto.original_text.split(" ")) {
          let originalRepCount = 0;
          for (let sourceEle of responseText.split(" ")) {
            let similarityScore = similarity(originalEle, sourceEle)
            if (similarityScore >= 0.40) {
              compareCharArr.push({ original_text: originalEle, response_text: sourceEle, score: similarity(originalEle, sourceEle) });
              //break;
            }
            if (similarityScore >= 0.60) {
              originalRepCount++;
            }
          }
          if (originalRepCount >= 2) {
            reptitionCount++;
          }
        }

        for (let compareCharArrEle of compareCharArr) {
          let score = 0;
          let word = '';
          for (let compareCharArrCmpEle of compareCharArr) {
            if (compareCharArrEle.original_text === compareCharArrCmpEle.original_text) {
              if (compareCharArrCmpEle.score > score) {
                score = compareCharArrCmpEle.score;
                word = compareCharArrCmpEle.response_text;
              }
            }
          }
          constructTextSet.add(word);
        }

        for (let constructTextSetEle of constructTextSet) {
          constructText += constructTextSetEle + ' ';
        }
        constructText = constructText.trim();

        function similarity(s1, s2) {
          var longer = s1;
          var shorter = s2;
          if (s1.length < s2.length) {
            longer = s2;
            shorter = s1;
          }
          var longerLength = longer.length;
          if (longerLength == 0) {
            return 1.0;
          }
          return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
        }

        function editDistance(s1, s2) {
          s1 = s1.toLowerCase();
          s2 = s2.toLowerCase();

          var costs = new Array();
          for (var i = 0; i <= s1.length; i++) {
            var lastValue = i;
            for (var j = 0; j <= s2.length; j++) {
              if (i == 0)
                costs[j] = j;
              else {
                if (j > 0) {
                  var newValue = costs[j - 1];
                  if (s1.charAt(i - 1) != s2.charAt(j - 1))
                    newValue = Math.min(Math.min(newValue, lastValue),
                      costs[j]) + 1;
                  costs[j - 1] = lastValue;
                  lastValue = newValue;
                }
              }
            }
            if (i > 0)
              costs[s2.length] = lastValue;
          }
          return costs[s2.length];
        }

        for (let constructTextELE of constructText.split("")) {
          if (constructTextELE != ' ') {
            if (vowelSignArr.includes(constructTextELE)) {
              if (isPrevVowel) {
                prevEle = prevEle + constructTextELE;
                constructTokenArr.push(prevEle);
              } else {
                prevEle = prevEle + constructTextELE;
                constructTokenArr.push(prevEle);
              }
              isPrevVowel = true;
            } else {
              constructTokenArr.push(constructTextELE);
              prevEle = constructTextELE;
              isPrevVowel = false;
            }
          }
        }

        // End Constructed Text Logic

        for (let originalTextELE of originalText.split("")) {
          if (originalTextELE != ' ') {
            if (vowelSignArr.includes(originalTextELE)) {
              if (isPrevVowel) {
                prevEle = prevEle + originalTextELE;
                originalTokenArr.push(prevEle);
              } else {
                prevEle = prevEle + originalTextELE;
                originalTokenArr.push(prevEle);
              }
              isPrevVowel = true;
            } else {
              originalTokenArr.push(originalTextELE);
              prevEle = originalTextELE;
              isPrevVowel = false;
            }
          }
        }

        for (let responseTextELE of responseText.split("")) {
          if (responseTextELE != ' ') {
            if (vowelSignArr.includes(responseTextELE)) {
              if (isPrevVowel) {
                prevEle = prevEle + responseTextELE;
                responseTokenArr.push(prevEle);
              } else {
                prevEle = prevEle + responseTextELE;
                responseTokenArr.push(prevEle);
              }
              isPrevVowel = true;
            } else {
              responseTokenArr.push(responseTextELE);
              prevEle = responseTextELE;
              isPrevVowel = false;
            }
          }
        }


        // Comparison Logic

        for (let originalTokenArrEle of originalTokenArr) {
          if (constructTokenArr.includes(originalTokenArrEle)) {
            correctTokens.push(originalTokenArrEle);
          } else {
            missingTokens.push(originalTokenArrEle);
          }
        }

        let missingTokenSet = new Set(missingTokens);

        missingTokens = Array.from(missingTokenSet)

        let filteredTokenArr = [];

        //token list for ai4bharat response
        let tokenArr = [];
        let anamolyTokenArr = [];

        // Create Single Array from AI4bharat tokens array
        CreateLearnerProfileDto.output[0].nBestTokens.forEach(element => {
          element.tokens.forEach(token => {
            let key = Object.keys(token)[0];
            let value = Object.values(token)[0];

            let insertObj = {};
            insertObj[key] = value;
            tokenArr.push(insertObj);

            let key1 = Object.keys(token)[1];
            let value1 = Object.values(token)[1];
            insertObj = {}
            insertObj[key1] = value1;
            anamolyTokenArr.push(insertObj);
          });
        });

        let uniqueChar = new Set();
        prevEle = '';
        isPrevVowel = false;

        // Create Unique token array
        for (let tokenArrEle of tokenArr) {
          let tokenString = Object.keys(tokenArrEle)[0];
          for (let keyEle of tokenString.split("")) {
            if (vowelSignArr.includes(keyEle)) {
              if (isPrevVowel) {
                prevEle = prevEle + keyEle;
                uniqueChar.add(prevEle);
              } else {
                prevEle = prevEle + keyEle;
                uniqueChar.add(prevEle);
              }
              isPrevVowel = true;
            } else {
              uniqueChar.add(keyEle);
              isPrevVowel = false;
              prevEle = keyEle
            }
          }
        }

        //unique token list for ai4bharat response
        let uniqueCharArr = Array.from(uniqueChar);

        //console.log(uniqueCharArr);

        isPrevVowel = false;

        // Get best score for Each Char
        for (let char of uniqueCharArr) {
          let score = 0.0;
          let prevChar = '';
          let isPrevVowel = false;

          for (let tokenArrEle of tokenArr) {
            let tokenString = Object.keys(tokenArrEle)[0];
            let tokenValue = Object.values(tokenArrEle)[0];

            for (let keyEle of tokenString.split("")) {
              let scoreVal: any = tokenValue;
              let charEle: any = keyEle;

              if (vowelSignArr.includes(charEle)) {
                if (isPrevVowel) {
                  prevChar = prevChar + charEle;
                  charEle = prevChar;
                } else {
                  prevChar = prevChar + charEle;
                  charEle = prevChar;
                }
                isPrevVowel = true;
              } else {
                prevChar = charEle;
                isPrevVowel = false;
              }



              if (char === charEle) {
                if (scoreVal > score) {
                  score = scoreVal;
                }
              }
            }
          }

          filteredTokenArr.push({ charkey: char, charvalue: score });
        }

        // Create confidence score array and anomoly array
        for (let value of filteredTokenArr) {
          let score: any = value.charvalue

          let identification_status = 0;

          if (score >= 0.90) {
            identification_status = 1;
          } else if (score >= 0.40) {
            identification_status = -1;
          } else {
            identification_status = 0;
          }

          if (value.charkey !== "" && value.charkey !== "▁") {
            if (correctTokens.includes(value.charkey)) {
              let hexcode = getTokenHexcode(value.charkey);

              if (hexcode !== '') {
                confidence_scoresArr.push(
                  {
                    token: value.charkey,
                    hexcode: hexcode,
                    confidence_score: value.charvalue,
                    identification_status: identification_status
                  }
                );
              } else {
                if (!missingTokens.includes(value.charkey) && !constructTokenArr.includes(value.charkey)) {
                  anomaly_scoreArr.push(
                    {
                      token: value.charkey.replaceAll("_", ""),
                      hexcode: hexcode,
                      confidence_score: value.charvalue,
                      identification_status: identification_status
                    }
                  );
                }
              }
            }
          }
        }

        for (let missingTokensEle of missingTokenSet) {
          let hexcode = getTokenHexcode(missingTokensEle);

          if (hexcode !== '') {
            if (kannadaVowelSignArr.includes(missingTokensEle)) { } else {
              if (!uniqueChar.has(missingTokensEle)) {
                missing_token_scoresArr.push(
                  {
                    token: missingTokensEle,
                    hexcode: hexcode,
                    confidence_score: 0.10,
                    identification_status: 0
                  }
                );
              }
            }
          }
        }

        for (let anamolyTokenArrEle of anamolyTokenArr) {
          let tokenString = Object.keys(anamolyTokenArrEle)[0];
          let tokenValue = Object.values(anamolyTokenArrEle)[0];

          if (tokenString != '') {
            let hexcode = getTokenHexcode(tokenString);
            if (hexcode !== '') {
              if (kannadaVowelSignArr.includes(tokenString)) { } else {
                anomaly_scoreArr.push(
                  {
                    token: tokenString.replaceAll("_", ""),
                    hexcode: hexcode,
                    confidence_score: tokenValue,
                    identification_status: 0
                  }
                );
              }
            }

          }

        }

        const url = process.env.ALL_TEXT_EVAL_API;

        const textData = {
          "reference": CreateLearnerProfileDto.original_text,
          "hypothesis": CreateLearnerProfileDto.output[0].source,
          "language": "kn",
          "base64_string": audioFile.toString('base64')
        };

        const textEvalMatrices = await lastValueFrom(
          this.httpService.post(url, JSON.stringify(textData), {
            headers: {
              'Content-Type': 'application/json',
            }
          }).pipe(
            map((resp) => resp.data),
            catchError((error: AxiosError) => {
              throw 'Error from text Eval service' + error;
            }),
          )
        );

        let wer = textEvalMatrices.wer;
        let cercal = textEvalMatrices.cer * 2;
        let charCount = Math.abs(CreateLearnerProfileDto.original_text.length - CreateLearnerProfileDto.output[0].source.length);
        let wordCount = Math.abs(CreateLearnerProfileDto.original_text.split(' ').length - CreateLearnerProfileDto.output[0].source.split(' ').length);
        let repetitions = reptitionCount;
        let pauseCount = textEvalMatrices.pause_count;
        let ins = textEvalMatrices.insertion.length;
        let del = textEvalMatrices.deletion.length;
        let sub = textEvalMatrices.substitution.length;

        let fluencyScore = ((wer * 5) + (cercal * 10) + (charCount * 10) + (wordCount * 10) + (repetitions * 10) + (pauseCount * 10) + (ins * 20) + (del * 15) + (sub * 5)) / 100;

        let createdAt = new Date().toISOString().replace('Z', '+00:00');

        createScoreData = {
          user_id: CreateLearnerProfileDto.user_id,
          session: {
            session_id: CreateLearnerProfileDto.session_id, // working logged in session id
            sub_session_id: CreateLearnerProfileDto.sub_session_id || "", // used to club set recorded data within session
            contentType: CreateLearnerProfileDto.contentType, // contentType could be Char, Word, Sentence and Paragraph
            contentId: CreateLearnerProfileDto.contentId || "", // contentId of original text content shown to user to speak
            createdAt: createdAt,
            language: language, // content language
            original_text: CreateLearnerProfileDto.original_text, // content text shown to speak
            response_text: responseText, // text return by ai after converting audio to text
            construct_text: constructText, // this will be constructed by matching response text with original text.
            confidence_scores: confidence_scoresArr, // confidence score array will include char's has identified by ai and has score
            anamolydata_scores: anomaly_scoreArr, // this char's recognise as noise in audio
            missing_token_scores: missing_token_scoresArr, // this char's missed to spoke or recognise by ai
            error_rate: {
              character: textEvalMatrices.cer,
              word: textEvalMatrices.wer
            },
            count_diff: {
              character: Math.abs(CreateLearnerProfileDto.original_text.length - CreateLearnerProfileDto.output[0].source.length),
              word: Math.abs(CreateLearnerProfileDto.original_text.split(' ').length - CreateLearnerProfileDto.output[0].source.split(' ').length)
            },
            eucledian_distance: {
              insertions: {
                chars: textEvalMatrices.insertion,
                count: textEvalMatrices.insertion.length
              },
              deletions: {
                chars: textEvalMatrices.deletion,
                count: textEvalMatrices.deletion.length
              },
              substitutions: {
                chars: textEvalMatrices.substitution,
                count: textEvalMatrices.substitution.length
              }
            },
            fluencyScore: fluencyScore.toFixed(3),
            silence_Pause: {
              total_duration: 0,
              count: textEvalMatrices.pause_count,
            },
            reptitionsCount: reptitionCount,
            asrOutput: JSON.stringify(CreateLearnerProfileDto.output)
          }
        };

        // Store Array to DB
        let data = this.scoresService.create(createScoreData);

        function getTokenHexcode(token: string) {
          let result = tokenHexcodeDataArr.find(item => item.token.trim() === token.trim());
          return result?.hexcode || '';
        }
      }

      return response.status(HttpStatus.CREATED).send({ status: 'success', msg: "Successfully stored data to learner profile", responseText: responseText, createScoreData: createScoreData })
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        original_text: { type: 'string', example: 'assisted language learning', description: "This will content text shown to user record" },
        audio: { type: 'string', example: 'Add english Wav file base64 string here', description: 'You can send .wav file or plain base64 string of wav file' },
        user_id: { type: 'string', example: '8635444062', description: 'This will generate from virtual service id service when user do login' },
        session_id: { type: 'string', example: '86354440621701972584385', description: 'This will generate from telemetry frontend lib when you do new login' },
        sub_session_id: { type: 'string', example: '86354440621701972584385', description: 'Use this sub session id if you want club recorded content within session' },
        language: { type: 'string', example: 'en', description: 'This need to be send as per language. For this api, send en for englishe' },
        date: {
          type: 'date', example: "2023-12-07T17:52:23.753Z"
        },
        contentId: { type: 'string', example: '5221f84c-8abb-4601-a9d0-f8d8dd496566', description: 'This content id will need to which is associated with original text' },
        contentType: { type: 'string', example: 'Sentence', description: 'Content type will be Char, Sentence, Word and Paragraph' }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Success message when data is stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while data is being stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({ summary: 'Store students learner ai profile, from the ASR output for a given wav file. This API will work for English' })
  @Post('/updateLearnerProfile/en')
  async updateLearnerProfileEn(@Res() response: FastifyReply, @Body() CreateLearnerProfileDto: CreateLearnerProfileDto) {
    try {
      let originalText = CreateLearnerProfileDto.original_text.replace(/[^\w\s]/gi, '');
      let createScoreData;
      let language = "en";
      let reptitionCount = 0;
      let responseText = "";
      let confidence_scoresArr = [];
      let anomaly_scoreArr = [];
      let missing_token_scoresArr = [];


      /* Condition to check whether content type is char or not. If content type is char
      dont process it from ASR and other processing related with text evalution matrices and scoring mechanism
      */
      if (CreateLearnerProfileDto['contentType'].toLowerCase() !== "char") {

        let audioFile;

        if (CreateLearnerProfileDto['output'] === undefined && CreateLearnerProfileDto.audio !== undefined) {
          audioFile = CreateLearnerProfileDto.audio;
          const decoded = audioFile.toString('base64');

          // Send Audio file to ASR to process and provide vector with char and score
          let audioOutput = await this.scoresService.audioFileToAsrOutput(decoded, CreateLearnerProfileDto.language);
          CreateLearnerProfileDto['output'] = audioOutput.output;

          if (CreateLearnerProfileDto.output[0].source === "") {
            return response.status(HttpStatus.BAD_REQUEST).send({
              status: "error",
              message: "Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly"
            });
          }
        }

        // Get All hexcode for this selected language
        let tokenHexcodeData = this.scoresService.gethexcodeMapping(language);
        let tokenHexcodeDataArr = [];

        await tokenHexcodeData.then((tokenHexcodedata: any) => {
          tokenHexcodeDataArr = tokenHexcodedata;
        });

        responseText = CreateLearnerProfileDto.output[0].source.replace(/[^\w\s]/gi, '');

        const url = process.env.ALL_TEXT_EVAL_API;

        const textData = {
          "reference": originalText,
          "hypothesis": responseText,
          "language": "en",
          "base64_string": audioFile.toString('base64')
        };

        const textEvalMatrices = await lastValueFrom(
          this.httpService.post(url, JSON.stringify(textData), {
            headers: {
              'Content-Type': 'application/json',
            }
          }).pipe(
            map((resp) => resp.data),
            catchError((error: AxiosError) => {
              throw 'Error from text Eval service' + error;
            }),
          )
        );

        for (let confidence_char of textEvalMatrices.confidence_char_list) {
          let hexcode = getTokenHexcode(confidence_char);

          if (hexcode !== '') {
            confidence_scoresArr.push({
              token: confidence_char.replaceAll("_", ""),
              hexcode: hexcode,
              confidence_score: 0.99,
              identification_status: 1
            })
          } else {
            anomaly_scoreArr.push({
              token: confidence_char.replaceAll("_", ""),
              hexcode: hexcode,
              confidence_score: 0.99,
              identification_status: 1
            }
            )
          }
        }

        for (let missing_char of textEvalMatrices.missing_char_list) {
          let hexcode = getTokenHexcode(missing_char);

          if (hexcode !== '') {
            missing_token_scoresArr.push({
              token: missing_char.replaceAll("_", ""),
              hexcode: hexcode,
              confidence_score: 0.1,
              identification_status: -1
            })
          } else {
            missing_token_scoresArr.push({
              token: missing_char.replaceAll("_", ""),
              hexcode: hexcode,
              confidence_score: 0.1,
              identification_status: -1
            }
            )
          }
        }


        let wer = textEvalMatrices.wer;
        let cercal = textEvalMatrices.cer * 2;
        let charCount = Math.abs(CreateLearnerProfileDto.original_text.length - CreateLearnerProfileDto.output[0].source.length);
        let wordCount = Math.abs(CreateLearnerProfileDto.original_text.split(' ').length - CreateLearnerProfileDto.output[0].source.split(' ').length);
        let repetitions = reptitionCount;
        let pauseCount = textEvalMatrices.pause_count;
        let ins = textEvalMatrices.insertion.length;
        let del = textEvalMatrices.deletion.length;
        let sub = textEvalMatrices.substitution.length;

        let fluencyScore = ((wer * 5) + (cercal * 10) + (charCount * 10) + (wordCount * 10) + (repetitions * 10) + (pauseCount * 10) + (ins * 20) + (del * 15) + (sub * 5)) / 100;

        let createdAt = new Date().toISOString().replace('Z', '+00:00')

        createScoreData = {
          user_id: CreateLearnerProfileDto.user_id, // userid sent by client
          session: {
            session_id: CreateLearnerProfileDto.session_id, // working logged in session id
            sub_session_id: CreateLearnerProfileDto.sub_session_id || "", // used to club set recorded data within session
            contentType: CreateLearnerProfileDto.contentType, // contentType could be Char, Word, Sentence and Paragraph
            contentId: CreateLearnerProfileDto.contentId || "", // contentId of original text content shown to user to speak
            createdAt: createdAt,
            language: language, // content language
            original_text: originalText, // content text shown to speak
            response_text: responseText, // text return by ai after converting audio to text
            construct_text: textEvalMatrices.construct_text.trim(), // this will be constructed by matching response text with original text.
            confidence_scores: confidence_scoresArr, // confidence score array will include char's has identified by ai and has score
            anamolydata_scores: anomaly_scoreArr, // this char's recognise as noise in audio
            missing_token_scores: missing_token_scoresArr, // this char's missed to spoke or recognise by ai
            error_rate: {
              character: textEvalMatrices.cer,
              word: textEvalMatrices.wer
            },
            count_diff: {
              character: Math.abs(originalText.length - responseText.length),
              word: Math.abs(originalText.split(' ').length - responseText.split(' ').length)
            },
            eucledian_distance: {
              insertions: {
                chars: textEvalMatrices.insertion,
                count: textEvalMatrices.insertion.length
              },
              deletions: {
                chars: textEvalMatrices.deletion,
                count: textEvalMatrices.deletion.length
              },
              substitutions: {
                chars: textEvalMatrices.substitution,
                count: textEvalMatrices.substitution.length
              }
            },
            fluencyScore: fluencyScore.toFixed(3),
            silence_Pause: {
              total_duration: 0,
              count: textEvalMatrices.pause_count,
            },
            reptitionsCount: reptitionCount,
            asrOutput: JSON.stringify(CreateLearnerProfileDto.output)
          }
        };

        // Store Array to DB
        let data = this.scoresService.create(createScoreData);

        function getTokenHexcode(token: string) {
          let result = tokenHexcodeDataArr.find(item => item.token === token);
          return result?.hexcode || '';
        }
      }

      return response.status(HttpStatus.CREATED).send({ status: 'success', msg: "Successfully stored data to learner profile", responseText: responseText, createScoreData: createScoreData })
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiParam({
    name: "sessionId",
    example: "20200765061699008295109"
  })
  @Get('/GetTargets/session/:sessionId')
  @ApiResponse({
    status: 200,
    description: 'Success response with Get Targets character and score for session id',
    schema: {
      properties: {
        character: { type: 'string' },
        score: { type: 'number', format: 'float' },
      }
    },
  })
  @ApiOperation({ summary: 'Get Targets character by session id' })
  async GetTargetsbySession(@Param('sessionId') id: string, @Res() response: FastifyReply) {
    try {
      let targetResult = await this.scoresService.getTargetsBySession(id)
      return response.status(HttpStatus.OK).send(targetResult);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiParam({
    name: "userId",
    example: "2020076506"
  })
  @Get('/GetTargets/user/:userId')
  @ApiOperation({ summary: 'Get Targets character by user id' })
  @ApiResponse({
    status: 200,
    description: 'Success response with Get Targets character and score for user id',
    schema: {
      properties: {
        character: { type: 'string' },
        score: { type: 'number', format: 'float' },
      }
    },
  })
  async GetTargetsbyUser(@Param('userId') id: string, @Query('language') language: string, @Res() response: FastifyReply) {
    try {
      let targetResult = await this.scoresService.getTargetsByUser(id, language);
      return response.status(HttpStatus.OK).send(targetResult);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiParam({
    name: "sessionId",
    example: "20200765061699008295109"
  })
  @Get('/GetFamiliarity/session/:sessionId')
  @ApiOperation({ summary: 'Get Familiarity of characters by session id' })
  @ApiResponse({
    status: 200,
    description: 'Success response for Get Familiarity of characters with score for session id',
    schema: {
      properties: {
        character: { type: 'string' },
        score: { type: 'number', format: 'float' },
      }
    },
  })
  async GetFamiliarityBysession(@Param('sessionId') id: string, @Res() response: FastifyReply) {
    try {
      let familiarityResult = await this.scoresService.getFamiliarityBySession(id)
      return response.status(HttpStatus.OK).send(familiarityResult);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiParam({
    name: "userId",
    example: "2020076506"
  })
  @Get('/GetFamiliarity/user/:userId')
  @ApiOperation({ summary: 'Get Familiarity of characters by user id' })
  @ApiResponse({
    status: 200,
    description: 'Success response for Get Familiarity of characters with score for user id',
    schema: {
      properties: {
        character: { type: 'string' },
        score: { type: 'number', format: 'float' },
      }
    },
  })
  async GetFamiliarityByUser(@Param('userId') id: string, @Res() response: FastifyReply) {
    try {
      let familiarityResult = await this.scoresService.getFamiliarityByUser(id);
      return response.status(HttpStatus.OK).send(familiarityResult);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiParam({
    name: "userId",
    example: "2020076506"
  })
  @Get('GetContent/char/:userId')
  @ApiOperation({ summary: 'Get a set of chars for the user to practice, upon feeding the Get Target Chars to Content Algorithm by user id' })
  @ApiResponse({
    status: 200,
    description: 'Success response with Get content and GetTarget chars for user id',
    schema: {
      properties: {
        content: { type: 'string' },
        getTargetChar: { type: 'string' }
      }
    },
  })
  async GetContentCharbyUser(@Param('userId') id: string, @Query('language') language: string, @Query() { contentlimit = 5 }, @Query() { gettargetlimit = 5 }, @Query() { tags }, @Res() response: FastifyReply) {
    try {
      let currentLevel = 'm0';
      let recordData: any = await this.scoresService.getlatestmilestone(id, language);
      currentLevel = recordData[0]?.milestone_level || "m0";

      let getGetTarget = await this.scoresService.getTargetsByUser(id, language);
      let validations = await this.scoresService.getAssessmentRecordsUserid(id);
      let tokenHexcodeData = await this.scoresService.gethexcodeMapping(language);

      let getGetTargetCharArr = getGetTarget.filter((getGetTargetEle, index) => {
        if (gettargetlimit > 0 && index >= gettargetlimit) {
          return false;
        }
        return true;
      }).map(charData => {
        return charData.character
      });

      let totalTargets = getGetTarget.length;
      let totalValidation = validations.length;

      // let sessions = await this.scoresService.getAllSessions(id, 5);
      // let totalSession = sessions.length;
      // let currentLevel = 'm0';
      // if (totalSession === 0) {
      //   currentLevel = 'm1';
      // } else {

      //   if (totalTargets >= 30) {
      //     currentLevel = 'm1';
      //   } else if (totalTargets < 30 && totalTargets >= 16) {
      //     if (totalValidation > 5) {
      //       currentLevel = 'm1';
      //     } else {
      //       currentLevel = 'm2';
      //     }
      //   } else if (totalTargets < 16 && totalTargets > 2) {
      //     if (totalValidation > 2) {
      //       currentLevel = 'm2';
      //     } else {
      //       currentLevel = 'm3';
      //     }
      //   } else if (totalTargets <= 2) {
      //     if (totalValidation > 0) {
      //       currentLevel = 'm3';
      //     } else {
      //       currentLevel = 'm4';
      //     }
      //   }
      // }

      let contentLevel = '';
      let complexityLevel = [];

      if (currentLevel === 'm0') {
        contentLevel = 'L1';
      } else if (currentLevel === 'm1') {
        contentLevel = 'L1';
      } else if (currentLevel === 'm2') {
        contentLevel = 'L2';
        complexityLevel = ["C1"]
      } else if (currentLevel === 'm3') {
        contentLevel = 'L2';
        complexityLevel = ["C1", "C2"];
      } else if (currentLevel === 'm4') {
        contentLevel = 'L3';
        complexityLevel = ["C1", "C2", "C3"]
      } else if (currentLevel === 'm5') {
        contentLevel = 'L3';
        complexityLevel = ["C2", "C3"]
      } else if (currentLevel === 'm6') {
        contentLevel = 'L4';
        complexityLevel = ["C2", "C3"]
      } else if (currentLevel === 'm7') {
        contentLevel = 'L4';
        complexityLevel = ["C2", "C3", "C4"]
      } else if (currentLevel === 'm8') {
        contentLevel = 'L5';
        complexityLevel = ["C3", "C4"]
      } else if (currentLevel === 'm9') {
        contentLevel = 'L6';
        complexityLevel = ["C3", "C4"]
      }

      let graphemesMappedObj = {}
      let graphemesMappedArr = [];

      if (language === "en") {
        getGetTargetCharArr.forEach((getGetTargetCharArrEle) => {
          let tokenGraphemes = getTokenGraphemes(getGetTargetCharArrEle);
          graphemesMappedObj[getGetTargetCharArrEle] = tokenGraphemes;
          graphemesMappedArr.push(...tokenGraphemes);
        });
      }

      const url = process.env.ALL_CONTENT_SERVICE_API;

      const textData = {
        "tokenArr": getGetTargetCharArr,
        "language": language || "ta",
        "contentType": "char",
        "limit": contentlimit || 5,
        "tags": tags,
        "cLevel": contentLevel,
        "complexityLevel": complexityLevel,
        "graphemesMappedObj": graphemesMappedObj
      };

      const newContent = await lastValueFrom(
        this.httpService.post(url, JSON.stringify(textData), {
          headers: {
            'Content-Type': 'application/json',
          }
        }).pipe(
          map((resp) => resp.data),
          catchError((error: AxiosError) => {
            throw 'Error at Content service API Call -' + error;
          }),
        )
      );

      let contentArr;
      let contentForTokenArr;

      if (newContent.data.hasOwnProperty('wordsArr')) {
        contentArr = newContent.data.wordsArr;
      } else {
        contentArr = [];
      }

      if (newContent.data.hasOwnProperty('contentForToken')) {
        contentForTokenArr = newContent.data.contentForToken;
      } else {
        contentForTokenArr = [];
      }

      if (language === "en") {
        getGetTargetCharArr = graphemesMappedArr;
      }

      function getTokenGraphemes(token: string) {
        let result = tokenHexcodeData.find(item => item.token.trim() === token.trim());
        return result?.graphemes || '';
      }

      return response.status(HttpStatus.OK).send({ content: contentArr, contentForToken: contentForTokenArr, getTargetChar: getGetTargetCharArr, totalTargets: totalTargets });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiParam({
    name: "userId",
    example: "2020076506"
  })
  @Get('GetContent/word/:userId')
  @ApiOperation({ summary: 'Get a set of words for the user to practice, upon feeding the Get Target Chars to Content Algorithm by user id' })
  @ApiResponse({
    status: 200,
    description: 'Success response with Get content and GetTarget chars for user id',
    schema: {
      properties: {
        content: { type: 'string' },
        getTargetChar: { type: 'string' }
      }
    },
  })
  async GetContentWordbyUser(@Param('userId') id: string, @Query('language') language: string, @Query() { contentlimit = 5 }, @Query() { gettargetlimit = 5 }, @Query() { tags }, @Res() response: FastifyReply) {
    try {

      let recordData: any = await this.scoresService.getlatestmilestone(id, language);
      let getGetTarget = await this.scoresService.getTargetsByUser(id, language);
      let validations = await this.scoresService.getAssessmentRecordsUserid(id);
      let tokenHexcodeData = await this.scoresService.gethexcodeMapping(language);

      let currentLevel = 'm0';
      currentLevel = recordData[0]?.milestone_level || "m0";
      let totalTargets = getGetTarget.length;

      let getGetTargetCharArr = getGetTarget.filter((getGetTargetEle, index) => {
        if (gettargetlimit > 0 && index >= gettargetlimit) {
          return false;
        }
        return true;
      }).map(charData => {
        return charData.character
      });

      let contentLevel = '';
      let complexityLevel = [];

      if (currentLevel === 'm0') {
        contentLevel = 'L1';
      } else if (currentLevel === 'm1') {
        contentLevel = 'L1';
      } else if (currentLevel === 'm2') {
        contentLevel = 'L2';
        complexityLevel = ["C1"]
      } else if (currentLevel === 'm3') {
        contentLevel = 'L2';
        complexityLevel = ["C1", "C2"];
      } else if (currentLevel === 'm4') {
        contentLevel = 'L3';
        complexityLevel = ["C1", "C2", "C3"]
      } else if (currentLevel === 'm5') {
        contentLevel = 'L3';
        complexityLevel = ["C2", "C3"]
      } else if (currentLevel === 'm6') {
        contentLevel = 'L4';
        complexityLevel = ["C2", "C3"]
      } else if (currentLevel === 'm7') {
        contentLevel = 'L4';
        complexityLevel = ["C2", "C3", "C4"]
      } else if (currentLevel === 'm8') {
        contentLevel = 'L5';
        complexityLevel = ["C3", "C4"]
      } else if (currentLevel === 'm9') {
        contentLevel = 'L6';
        complexityLevel = ["C3", "C4"]
      }

      let graphemesMappedObj = {}
      let graphemesMappedArr = [];

      if (language === "en") {
        getGetTargetCharArr.forEach((getGetTargetCharArrEle) => {
          let tokenGraphemes = getTokenGraphemes(getGetTargetCharArrEle);
          graphemesMappedObj[getGetTargetCharArrEle] = tokenGraphemes;
          graphemesMappedArr.push(...tokenGraphemes);
        });
      }

      const url = process.env.ALL_CONTENT_SERVICE_API;

      const textData = {
        "tokenArr": getGetTargetCharArr,
        "language": language || "ta",
        "contentType": "Word",
        "limit": contentlimit || 5,
        "tags": tags,
        "cLevel": contentLevel,
        "complexityLevel": complexityLevel,
        "graphemesMappedObj": graphemesMappedObj,
      };

      const newContent = await lastValueFrom(
        this.httpService.post(url, JSON.stringify(textData), {
          headers: {
            'Content-Type': 'application/json',
          }
        }).pipe(
          map((resp) => resp.data),
          catchError((error: AxiosError) => {
            throw 'Error at Content service API Call -' + error;
          })
        )
      );

      let contentArr;
      let contentForTokenArr;

      if (newContent.data.hasOwnProperty('wordsArr')) {
        contentArr = newContent.data.wordsArr;
      } else {
        contentArr = [];
      }

      if (newContent.data.hasOwnProperty('contentForToken')) {
        contentForTokenArr = newContent.data.contentForToken;
      } else {
        contentForTokenArr = [];
      }

      if (language === "en") {
        getGetTargetCharArr = graphemesMappedArr;
      }

      function getTokenGraphemes(token: string) {
        let result = tokenHexcodeData.find(item => item.token.trim() === token.trim());
        return result?.graphemes || '';
      }

      return response.status(HttpStatus.OK).send({ content: contentArr, contentForToken: contentForTokenArr, getTargetChar: getGetTargetCharArr, totalTargets: totalTargets });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiParam({
    name: "userId",
    example: "2020076506"
  })
  @Get('GetContent/sentence/:userId')
  @ApiOperation({ summary: 'Get a set of sentences for the user to practice, upon feeding the Get Target Chars to Content Algorithm by user id' })
  @ApiResponse({
    status: 200,
    description: 'Success response with Get content and GetTarget chars for user id',
    schema: {
      properties: {
        content: { type: 'string' },
        getTargetChar: { type: 'string' }
      }
    },
  })
  async GetContentSentencebyUser(@Param('userId') id: string, @Query('language') language, @Query() { contentlimit = 5 }, @Query() { gettargetlimit = 5 }, @Query() { tags }, @Res() response: FastifyReply) {
    try {
      let currentLevel = 'm0';
      let recordData: any = await this.scoresService.getlatestmilestone(id, language);
      currentLevel = recordData[0]?.milestone_level || "m0";

      let getGetTarget = await this.scoresService.getTargetsByUser(id, language);
      let validations = await this.scoresService.getAssessmentRecordsUserid(id);
      let tokenHexcodeData = await this.scoresService.gethexcodeMapping(language);
      let getGetTargetCharArr = getGetTarget.filter((getGetTargetEle, index) => {
        if (gettargetlimit > 0 && index >= gettargetlimit) {
          return false;
        }
        return true;
      }).map(charData => {
        return charData.character
      });

      let totalTargets = getGetTarget.length;
      let totalValidation = validations.length;

      let contentLevel = '';
      let complexityLevel = [];

      if (currentLevel === 'm0') {
        contentLevel = 'L1';
      } else if (currentLevel === 'm1') {
        contentLevel = 'L1';
      } else if (currentLevel === 'm2') {
        contentLevel = 'L2';
        complexityLevel = ["C1"]
      } else if (currentLevel === 'm3') {
        contentLevel = 'L2';
        complexityLevel = ["C1", "C2"];
      } else if (currentLevel === 'm4') {
        contentLevel = 'L3';
        complexityLevel = ["C1", "C2", "C3"]
      } else if (currentLevel === 'm5') {
        contentLevel = 'L3';
        complexityLevel = ["C2", "C3"]
      } else if (currentLevel === 'm6') {
        contentLevel = 'L4';
        complexityLevel = ["C2", "C3"]
      } else if (currentLevel === 'm7') {
        contentLevel = 'L4';
        complexityLevel = ["C2", "C3", "C4"]
      } else if (currentLevel === 'm8') {
        contentLevel = 'L5';
        complexityLevel = ["C3", "C4"]
      } else if (currentLevel === 'm9') {
        contentLevel = 'L6';
        complexityLevel = ["C3", "C4"]
      }

      let graphemesMappedObj = {}
      let graphemesMappedArr = [];

      if (language === "en") {
        getGetTargetCharArr.forEach((getGetTargetCharArrEle) => {
          let tokenGraphemes = getTokenGraphemes(getGetTargetCharArrEle);
          graphemesMappedObj[getGetTargetCharArrEle] = tokenGraphemes;
          graphemesMappedArr.push(...tokenGraphemes);
        });
      }


      const url = process.env.ALL_CONTENT_SERVICE_API;

      const textData = {
        "tokenArr": getGetTargetCharArr,
        "language": language || "ta",
        "contentType": "Sentence",
        "limit": contentlimit || 5,
        "tags": tags,
        "cLevel": contentLevel,
        "complexityLevel": complexityLevel,
        "graphemesMappedObj": graphemesMappedObj
      };

      const newContent = await lastValueFrom(
        this.httpService.post(url, JSON.stringify(textData), {
          headers: {
            'Content-Type': 'application/json',
          }
        }).pipe(
          map((resp) => resp.data),
          catchError((error: AxiosError) => {
            throw 'Error at Content service API Call -' + error;
          }),
        )
      );

      let contentArr;
      let contentForTokenArr;

      if (newContent.data.hasOwnProperty('wordsArr')) {
        contentArr = newContent.data.wordsArr;
      } else {
        contentArr = [];
      }

      if (newContent.data.hasOwnProperty('contentForToken')) {
        contentForTokenArr = newContent.data.contentForToken;
      } else {
        contentForTokenArr = [];
      }

      if (language === "en") {
        getGetTargetCharArr = graphemesMappedArr;
      }

      function getTokenGraphemes(token: string) {
        let result = tokenHexcodeData.find(item => item.token.trim() === token.trim());
        return result?.graphemes || '';
      }

      return response.status(HttpStatus.OK).send({ content: contentArr, contentForToken: contentForTokenArr, getTargetChar: getGetTargetCharArr, totalTargets: totalTargets });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }

  }

  @ApiParam({
    name: "userId",
    example: "2020076506"
  })
  @Get('GetContent/paragraph/:userId')
  @ApiOperation({ summary: 'Get a set of paragraphs for the user to practice, upon feeding the Get Target Chars to Content Algorithm by user id' })
  @ApiResponse({
    status: 200,
    description: 'Success response with Get content and GetTarget chars for user id',
    schema: {
      properties: {
        content: { type: 'string' },
        getTargetChar: { type: 'string' }
      }
    },
  })
  async GetContentParagraphbyUser(@Param('userId') id: string, @Query('language') language, @Query() { contentlimit = 5 }, @Query() { gettargetlimit = 5 }, @Query() { tags }, @Res() response: FastifyReply) {
    try {
      let currentLevel = 'm0';

      let recordData: any = await this.scoresService.getlatestmilestone(id, language);
      currentLevel = recordData[0]?.milestone_level || "m0";

      let getGetTarget = await this.scoresService.getTargetsByUser(id, language);
      let tokenHexcodeData = await this.scoresService.gethexcodeMapping(language);

      let getGetTargetCharArr = getGetTarget.filter((getGetTargetEle, index) => {
        if (gettargetlimit > 0 && index >= gettargetlimit) {
          return false;
        }
        return true;
      }).map(charData => {
        return charData.character
      });

      let totalTargets = getGetTarget.length;

      let graphemesMappedObj = {}
      let graphemesMappedArr = [];

      if (language === "en") {
        getGetTargetCharArr.forEach((getGetTargetCharArrEle) => {
          let tokenGraphemes = getTokenGraphemes(getGetTargetCharArrEle);
          graphemesMappedObj[getGetTargetCharArrEle] = tokenGraphemes;
          graphemesMappedArr.push(...tokenGraphemes);
        });
      }

      let contentLevel = '';
      let complexityLevel = [];

      if (currentLevel === 'm0') {
        contentLevel = 'L1';
      } else if (currentLevel === 'm1') {
        contentLevel = 'L1';
      } else if (currentLevel === 'm2') {
        contentLevel = 'L2';
        complexityLevel = ["C1"]
      } else if (currentLevel === 'm3') {
        contentLevel = 'L2';
        complexityLevel = ["C1", "C2"];
      } else if (currentLevel === 'm4') {
        contentLevel = 'L3';
        complexityLevel = ["C1", "C2", "C3"]
      } else if (currentLevel === 'm5') {
        contentLevel = 'L3';
        complexityLevel = ["C2", "C3"]
      } else if (currentLevel === 'm6') {
        contentLevel = 'L4';
        complexityLevel = ["C2", "C3"]
      } else if (currentLevel === 'm7') {
        contentLevel = 'L4';
        complexityLevel = ["C2", "C3", "C4"]
      } else if (currentLevel === 'm8') {
        contentLevel = 'L5';
        complexityLevel = ["C3", "C4"]
      } else if (currentLevel === 'm9') {
        contentLevel = 'L6';
        complexityLevel = ["C3", "C4"]
      }
      const url = process.env.ALL_CONTENT_SERVICE_API;

      const textData = {
        "tokenArr": getGetTargetCharArr,
        "language": language || "ta",
        "contentType": "Paragraph",
        "limit": contentlimit || 5,
        "tags": tags,
        "cLevel": contentLevel,
        "complexityLevel": complexityLevel,
        "graphemesMappedObj": graphemesMappedObj
      };

      const newContent = await lastValueFrom(
        this.httpService.post(url, JSON.stringify(textData), {
          headers: {
            'Content-Type': 'application/json',
          }
        }).pipe(
          map((resp) => resp.data),
          catchError((error: AxiosError) => {
            throw 'Error at Content service API Call -' + error;
          })
        )
      );

      let contentArr;
      let contentForTokenArr;

      if (newContent.data.hasOwnProperty('wordsArr')) {
        contentArr = newContent.data.wordsArr;
      } else {
        contentArr = [];
      }

      if (newContent.data.hasOwnProperty('contentForToken')) {
        contentForTokenArr = newContent.data.contentForToken;
      } else {
        contentForTokenArr = [];
      }

      if (language === "en") {
        getGetTargetCharArr = graphemesMappedArr;
      }

      function getTokenGraphemes(token: string) {
        let result = tokenHexcodeData.find(item => item.token.trim() === token.trim());
        return result?.graphemes || '';
      }


      return response.status(HttpStatus.OK).send({ content: contentArr, contentForToken: contentForTokenArr, getTargetChar: getGetTargetCharArr, totalTargets: totalTargets });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiExcludeEndpoint(true)
  @ApiBody({
    description: `Api request body include these schema properties.
    Based on sub session id we will calculate targets and contenttype will prepare result.
    Collection id will only used for to identify discovery set.Based on discovery set will update level`,
    schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', example: '8635444062' },
        session_id: { type: 'string', example: '86354440621701972584385' },
        sub_session_id: { type: 'string', example: '86354440621701972584385', description: 'This required as result is calculated based on sub session records targets' },
        contentType: { type: 'string', example: 'Sentence' },
        collectionId: { type: 'string', example: "5221f84c-8abb-4601-a9d0-f8d8dd496566", description: 'Send collectionid only when you are doing discovery', }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: `This will provide you session result with targets
    and also update level if level updation criteria matched`,
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        sessionResult: { type: 'string', example: 'pass' },
        totalTargets: { type: 'number', example: 14 },
        currentLevel: { type: 'string', example: 'm3' },
        previous_level: { type: 'string', example: 'm0' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: `Error while data is being calculate sub-session result and
    milestone level updation`,
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({ summary: 'This API will give pass or fail result with gettarget count for records performed in the subsession. Also this API perform milestone update for discovery and showcase.' })
  @Post('/getSetResult')
  async getSetResult(@Res() response: FastifyReply, @Body() getSetResult: any) {
    try {
      let milestoneEntry = true;
      let targets = await this.scoresService.getTargetsBysubSession(getSetResult.sub_session_id, getSetResult.contentType, getSetResult.language);
      let fluency = await this.scoresService.getFluencyBysubSession(getSetResult.sub_session_id, getSetResult.language);
      let familiarity = await this.scoresService.getFamiliarityBysubSession(getSetResult.sub_session_id, getSetResult.contentType, getSetResult.language);

      let totalTargets = targets.length;
      let totalFamiliarity = familiarity.length;
      let totalSyllables = totalTargets + totalFamiliarity;
      let targetsPercentage = Math.floor((totalTargets / totalSyllables) * 100);
      let passingPercentage = Math.floor(100 - targetsPercentage);

      let sessionResult = 'No Result';

      let recordData: any = await this.scoresService.getlatestmilestone(getSetResult.user_id, getSetResult.language);
      let previous_level = recordData[0]?.milestone_level || undefined;

      if (targetsPercentage <= 30) {
        if (getSetResult.contentType.toLowerCase() === 'word') {
          if (fluency < 2) {
            sessionResult = 'pass';
          } else {
            sessionResult = 'fail';
          }
        } else if (getSetResult.contentType.toLowerCase() === 'sentence') {
          if (fluency < 6) {
            sessionResult = 'pass';
          } else {
            sessionResult = 'fail';
          }
        } else if (getSetResult.contentType.toLowerCase() === 'paragraph') {
          if (fluency < 10) {
            sessionResult = 'pass';
          } else {
            sessionResult = 'fail';
          }
        }
      } else {
        sessionResult = 'fail';
      }

      let milestone_level = previous_level;

      if (getSetResult.collectionId === "5221f84c-8abb-4601-a9d0-f8d8dd496566" || getSetResult.collectionId === "e9c7d535-3e98-4de1-b638-fae9413d7c09" || getSetResult.collectionId === "575fbb16-5b6c-43d8-96ca-f2288251b45e" ||
        getSetResult.collectionId === "7c736010-6c8f-42b7-b61a-e6f801b3e163" && getSetResult.language === "ta") {
        previous_level = 'm0';
        let addMilestoneResult = await this.scoresService.createMilestoneRecord({
          user_id: getSetResult.user_id,
          session_id: getSetResult.session_id,
          sub_session_id: getSetResult.sub_session_id,
          milestone_level: previous_level,
          sub_milestone_level: "",
        });
      } else if (getSetResult.collectionId === "1cc3b4d4-79ad-4412-9325-b7fb6ca875bf" || getSetResult.collectionId === "976a7631-3887-4d18-9576-7ca8205b82e8" ||
        getSetResult.collectionId === "9374ae97-80e4-419b-8e96-784734317e82" || getSetResult.collectionId === "e6f3537d-7a34-4b08-9824-0ddbc4c49be3" && getSetResult.language === "kn") {
        previous_level = 'm0';
        let addMilestoneResult = await this.scoresService.createMilestoneRecord({
          user_id: getSetResult.user_id,
          session_id: getSetResult.session_id,
          sub_session_id: getSetResult.sub_session_id,
          milestone_level: previous_level,
          sub_milestone_level: "",
        });
      } else if (getSetResult.collectionId === "36e4cff0-0552-4107-b8f4-9f9c5a3ff3c1" || getSetResult.collectionId === "fba7282d-aba3-4e95-8916-40b79f9e3f50" ||
        getSetResult.collectionId === "3c62cb34-9565-4b81-8e96-da86d90b6072" || getSetResult.collectionId === "c637ac92-2ecf-4015-82e9-c4002479ae32" && getSetResult.language === "en") {
        previous_level = 'm0';
        let addMilestoneResult = await this.scoresService.createMilestoneRecord({
          user_id: getSetResult.user_id,
          session_id: getSetResult.session_id,
          sub_session_id: getSetResult.sub_session_id,
          milestone_level: previous_level,
          sub_milestone_level: "",
        });
      } else {
        if (getSetResult.language === "ta" && getSetResult.collectionId !== "" && getSetResult.collectionId !== undefined) {
          if (getSetResult.collectionId === "bd20fee5-31c3-48d9-ab6f-842eeebf17ff" || getSetResult.collectionId === "61bc9579-0f9b-47ae-b446-7cdd525ce413" ||
            getSetResult.collectionId === "76ef507c-5d56-457c-aa3a-647cf5dba545" ||
            getSetResult.collectionId === "55767bfa-0e12-4d8f-999b-e84daf6c7587") {
            if (sessionResult === "pass") {
              milestone_level = "m2";
            }
            else {
              milestone_level = "m1";
            }
          } else if (getSetResult.collectionId === "986ff23e-8b56-4366-8510-8a7e7e0f36da" || getSetResult.collectionId === "85d58650-0771-4b28-b185-d074b5a5982d" ||
            getSetResult.collectionId === "461d9b9e-0db6-48ce-9088-d377d0cd33a6" ||
            getSetResult.collectionId === "2b196c2a-5f8e-4507-ac60-98d9fe6ae12b") {
            if (sessionResult === "fail") {
              milestone_level = "m3";
            }
            else {
              milestoneEntry = false;
            }
          } else if (getSetResult.collectionId === "67b820f5-096d-42c2-acce-b781d59efe7e" || getSetResult.collectionId === "895518d8-64ec-406d-a3d9-44c4ba8d2e57" ||
            getSetResult.collectionId === "b83971a5-22a8-46ea-90ab-485182c7cd9d" ||
            getSetResult.collectionId === "68dfd9cb-a33d-4d15-a3ea-54755f8311c8") {
            milestone_level = "m4";
          } else if (getSetResult.collectionId === "94312c93-5bb8-4144-8822-9a61ad1cd5a8" || getSetResult.collectionId === "67697c4f-fdd2-446b-b765-f610bc2c355c" ||
            getSetResult.collectionId === "f9ea2715-0d1b-465e-83f9-54c77341f388" ||
            getSetResult.collectionId === "ed47eb63-87c8-41f4-821d-1400fef37b78") {
            milestone_level = "m1";
          }
        } else if (getSetResult.language === "kn" && getSetResult.collectionId !== "" && getSetResult.collectionId !== undefined) {
          if (getSetResult.collectionId === "b755df98-198b-440a-90e0-391579ef4bfb" || getSetResult.collectionId === "4a8bddeb-cddd-4b64-9845-662a0d287c34" ||
            getSetResult.collectionId === "f9b877d2-4994-4eab-998c-aacaf0076b5a" ||
            getSetResult.collectionId === "6a89f990-8727-49da-b128-b7ea1839d025") {
            if (sessionResult === "pass") {
              milestone_level = "m2";
            }
            else {
              milestone_level = "m1";
            }
          } else if (getSetResult.collectionId === "29bb9cff-9510-4693-bec5-9436a686b836" || getSetResult.collectionId === "5828539f-4b1f-4502-b648-b2843d61f35d" ||
            getSetResult.collectionId === "37a406a5-d82e-447d-9762-17c76f5005ef" ||
            getSetResult.collectionId === "69b5512e-7b9f-43a6-9e6c-b25fb83b8661") {
            if (sessionResult === "fail") {
              milestone_level = "m3";
            }
            else {
              milestoneEntry = false;
            }
          } else if (getSetResult.collectionId === "a2c5e2ef-27b8-43d0-9c17-38cdcfe50f4c" || getSetResult.collectionId === "390c8719-fc52-42f3-b49d-41547a0639d7" ||
            getSetResult.collectionId === "aee5f3f4-213c-4596-8074-0addab60122a" ||
            getSetResult.collectionId === "e28d2463-adca-46e6-8159-04c99d6158d3") {
            milestone_level = "m4";
          } else if (getSetResult.collectionId === "ac930427-4a73-41a8-94d5-be74defd2993" || getSetResult.collectionId === "086482ed-9748-4c74-93b1-fe24dd6c98c7" ||
            getSetResult.collectionId === "272a648e-f2a3-41a4-a3dd-6ebf4b5ec40d" ||
            getSetResult.collectionId === "61b65b9b-94b8-4212-94e5-33ce8e80435a") {
            milestone_level = "m1";
          }
        } else if (getSetResult.language === "en" && getSetResult.collectionId !== "" && getSetResult.collectionId !== undefined) {
          if (getSetResult.collectionId === "91a5279d-f4a2-4c4d-bc8f-0b15ba6e5995" || getSetResult.collectionId === "d6d95b4a-9d74-48ff-8f75-a606d5672764" ||
            getSetResult.collectionId === "f99ff325-05c0-4cff-b825-b2cbb9638300" ||
            getSetResult.collectionId === "775c974a-4bda-4cfc-bc47-2aff56e39c46") {
            if (sessionResult === "pass") {
              milestone_level = "m2";
            }
            else {
              milestone_level = "m1";
            }
          } else if (getSetResult.collectionId === "f9eb8c70-524f-46a1-a737-1eec64a42e6f" || getSetResult.collectionId === "f24d6660-c759-44f9-a4ae-5b46b62098b2" ||
            getSetResult.collectionId === "f6b5638d-4398-4cf4-833c-42a4695a6425" ||
            getSetResult.collectionId === "87c2866e-6249-4fe1-9b1b-8b22ddd05ea7") {
            if (sessionResult === "fail") {
              milestone_level = "m3";
            }
            else {
              milestoneEntry = false;
            }
          } else if (getSetResult.collectionId === "e62061ea-4195-4460-b8e3-c0433bf8624e" || getSetResult.collectionId === "e276d47b-b262-4af1-b424-ead68b2b83bf" ||
            getSetResult.collectionId === "b9ab3b2f-5c21-4c61-b9c8-90898b5278dd" ||
            getSetResult.collectionId === "809039e5-119d-42ae-925f-b2546b1e3d7b") {
            milestone_level = "m4";
          } else if (getSetResult.collectionId === "5b69052e-f609-4004-adce-cf0fcfdac98b" || getSetResult.collectionId === "30c5800e-4a02-4259-8328-abf57e4255ca" ||
            getSetResult.collectionId === "b2eb8d4a-5d2b-441a-8269-0151e089c253" ||
            getSetResult.collectionId === "b12b79ec-f7cb-44b4-99c9-5ea747d4f99a") {
            milestone_level = "m1";
          }
        }
        else if (getSetResult.collectionId === "" || getSetResult.collectionId === undefined) {
          let previous_level_id = previous_level === undefined ? 0 : parseInt(previous_level[1])
          if (sessionResult === "pass") {
            if (previous_level_id === 9) {
              milestone_level = "m9"
            } else {
              previous_level_id++;
              milestone_level = "m" + previous_level_id;
            }
          }
        }

        if (milestoneEntry) {
          let addMilestoneResult = await this.scoresService.createMilestoneRecord({
            user_id: getSetResult.user_id,
            session_id: getSetResult.session_id,
            sub_session_id: getSetResult.sub_session_id,
            milestone_level: milestone_level,
            sub_milestone_level: "",
          });
        }
      }

      recordData = await this.scoresService.getlatestmilestone(getSetResult.user_id, getSetResult.language);

      let currentLevel = recordData[0]?.milestone_level || undefined;

      if (currentLevel === undefined) {
        currentLevel = previous_level;
      }

      return response.status(HttpStatus.CREATED).send({
        status: 'success', data: {
          sessionResult: sessionResult,
          totalTargets: totalTargets,
          currentLevel: currentLevel,
          previous_level: previous_level,
          familiarity: familiarity,
          familiarityCount: totalFamiliarity,
          targets: targets,
          targetsCount: totalTargets,
          totalSyllables: totalSyllables,
          fluency: fluency,
          percentage: passingPercentage || 0,
          targetsPercentage: targetsPercentage || 0
        }
      })
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiExcludeEndpoint(true)
  @ApiParam({
    name: "userId",
    example: "27519278861697549531193"
  })
  @ApiOperation({ summary: 'This API will give you current milestone level of user.' })
  @ApiResponse({
    status: 200,
    description: 'Success response with current milestone level of user',
    schema: {
      properties: {
        milestone_level: { type: 'string', example: 'm0' },
      }
    },
  })
  @Get('/getMilestone/user/:userId')
  async getMilestone(@Param('userId') id: string, @Query('language') language: string, @Res() response: FastifyReply,) {
    try {
      let recordData: any = await this.scoresService.getlatestmilestone(id, language);
      let milestone_level = recordData[0]?.milestone_level || "m0";
      return response.status(HttpStatus.CREATED).send({ status: 'success', data: { milestone_level: milestone_level } });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiExcludeEndpoint(true)
  @Post('/GetMissingChars')
  async GetMissingChars(@Res() response: FastifyReply, @Body() storyData: any) {
    let data = await this.scoresService.getMissingChars(storyData.storyLanguage);

    let storyString = storyData.storyString;

    let tokenArr = storyString.split("");

    let taVowelSignArr = [
      "ா",
      "ி",
      "ீ",
      "ு",
      "ூ",
      "ெ",
      "ே",
      "ை",
      "ொ",
      "ோ",
      "ௌ",
      "்",
    ];

    let vowelSignArr = taVowelSignArr;

    let uniqueChar = new Set();
    let uniqueCharArr = [];
    let prevEle = '';
    let isPrevVowel = false;

    // Create Unique token array
    for (let tokenArrEle of tokenArr) {

      for (let keyEle of tokenArrEle.split("")) {
        if (vowelSignArr.includes(keyEle)) {
          if (isPrevVowel) {
            let prevEleArr = prevEle.split("");
            if (prevEleArr.length) {
              prevEle = prevEleArr[0] + keyEle;
              uniqueCharArr[uniqueCharArr.length - 1] = prevEle;
            }
          } else {
            prevEle = prevEle + keyEle;
            uniqueCharArr[uniqueCharArr.length - 1] = prevEle;
            //uniqueCharArr.push(prevEle);
          }
          isPrevVowel = true;
        } else {
          if (keyEle != ' ') {
            uniqueCharArr.push(keyEle);
          }
          prevEle = keyEle;
          isPrevVowel = false;
        }
      }
    }

    //let uniqueCharArr = Array.from(uniqueChar);
    let matched = uniqueCharArr.filter(element => data.includes(element));
    let matchtedTotal = matched.length;

    let notIncluded = data.filter(element => {
      if (!uniqueCharArr.includes(element)) {
        return element;
      }
    });
    let notIncludedTotal = notIncluded.length;

    console.log(uniqueCharArr);
    return response.status(HttpStatus.CREATED).send({ status: 'success', matched: matched, matchtedTotal: matchtedTotal, notIncluded: notIncluded, notIncludedTotal: notIncludedTotal })
  }

  @ApiExcludeEndpoint(true)
  @Post('/addAssessmentInput')
  async AddAssessmentInput(@Res() response: FastifyReply, @Body() assessmentInput: AssessmentInputDto) {
    let data = await this.scoresService.assessmentInputCreate(assessmentInput);
    return response.status(HttpStatus.CREATED).send({ status: 'success', msg: "Successfully stored data to Assessment Input" })
  }

  @ApiExcludeEndpoint(true)
  @Get('/GetSessionIds/:userId')
  GetSessionIdsByUser(@Param('userId') id: string, @Query() { limit = 5 }) {
    return this.scoresService.getAllSessions(id, limit);
  }

  
  @ApiExcludeEndpoint(true)
  @Post('/getUsersTargets')
  async GetUsersTargets(@Res() response: FastifyReply, @Body() data: any) {
    try {
      const {userIds,language}  = data;
      let recordData = {};
        for (const userId of userIds) {
            const userRecord = await this.scoresService.getTargetsByUser(userId, language);
            recordData[userId] = userRecord ;
        }
      return response.status(HttpStatus.OK).send(recordData);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }
}
