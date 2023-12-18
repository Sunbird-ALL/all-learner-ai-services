import { Controller, Get, Post, Body, Patch, Param, Delete, HttpStatus, Res, Search, Query } from '@nestjs/common';
import { ScoresService } from './scores.service';
import { CreateLearnerProfileDto } from './dto/CreateLearnerProfile.dto';
import { AssessmentInputDto } from './dto/AssessmentInput.dto';
import { FastifyReply } from 'fastify';
import { ApiBody, ApiExcludeEndpoint, ApiForbiddenResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { lastValueFrom, map } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { wordErrorRate } from "word-error-rate";
import * as calcCER from 'character-error-rate';
import * as DiffMatchPatch from 'diff-match-patch';
import * as difflib from 'difflib';

@ApiTags('scores')
@Controller('scores')
export class ScoresController {
  constructor(
    private readonly scoresService: ScoresService,
    private readonly httpService: HttpService
  ) { }

  @ApiExcludeEndpoint(true)
  @Post()
  async create(@Res() response: FastifyReply, @Body() CreateLearnerProfileDto: CreateLearnerProfileDto) {
    try {

      let confidence_scoresArr = [];
      let missing_token_scoresArr = [];
      let anomaly_scoreArr = [];

      let originalText = CreateLearnerProfileDto.original_text;
      let responseText = CreateLearnerProfileDto.output[0].source;
      let originalTextTokensArr = originalText.split("");
      let responseTextTokensArr = responseText.split("");

      let originalTextArr = originalText.split(" ");
      let responseTextArr = responseText.split(" ");

      let originalTextWordCount = [];

      for (let originalTextSetEle of new Set(originalTextArr)) {
        let wordCount = 0;
        for (let originalTextArrEle of originalTextArr) {
          if (originalTextSetEle === originalTextArrEle) {
            wordCount++;
          }
        }
        originalTextWordCount.push({ word: originalTextSetEle, count: wordCount });
      }

      for (let originalTextWordCountEle of originalTextWordCount) {
        let count = 0;
        for (let responseTextArrEle of responseTextArr) {
          if (originalTextWordCountEle.word === responseTextArrEle) {
            count++;
          }
        }
        if (count != 0 && originalTextWordCountEle.count < count) {
          return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
            status: "error",
            message: "Avoid repetitions and record again"
          });
        }
      }

      let correctTokens = [];
      let missingTokens = [];

      let hindiVowelSignArr = ["ा", "ि", "ी", "ु", "ू", "ृ", "े", "ै", "ो", "ौ", "ं", "ः", "ँ", "ॉ", "ों", "्", "़", "़ा"];

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

      let language = CreateLearnerProfileDto?.language || "ta";

      if (language === "hi") {
        vowelSignArr = hindiVowelSignArr;
      } else if (language === "ta") {
        vowelSignArr = taVowelSignArr;
      }

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
            } else {
              prevEle = prevEle + originalTextELE;
              originalTokenArr[originalTokenArr.length - 1] = prevEle;
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
              // let prevEleArr = prevEle.split("");
              // prevEle = prevEleArr[0] + responseTextELE;
              // responseTokenArr.push(prevEle);
            } else {
              prevEle = prevEle + responseTextELE;
              responseTokenArr[responseTokenArr.length - 1] = prevEle;
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
              if (language !== 'hi') {
                let prevEleArr = prevEle.split("");
                prevEle = prevEleArr[0] + keyEle;
                uniqueChar.add(prevEle);
              } else {
                //console.log(prevEle + keyEle);
                prevEle = prevEle + keyEle;
                uniqueChar.add(prevEle);
              }
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
                if (language !== 'hi') {
                  let prevCharArr = prevChar.split("");
                  prevChar = prevCharArr[0] + charEle;
                  charEle = prevChar;
                } else {
                  prevChar = prevChar + charEle;
                  charEle = prevChar;
                }
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
              if (!missingTokens.includes(value.charkey) && !responseTokenArr.includes(value.charkey)) {
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

      for (let missingTokensEle of missingTokens) {
        let hexcode = getTokenHexcode(missingTokensEle);

        if (hexcode !== '') {
          if (hindiVowelSignArr.includes(missingTokensEle) || taVowelSignArr.includes(missingTokensEle)) { } else {
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

      for (let anamolyTokenArrEle of anamolyTokenArr) {
        let tokenString = Object.keys(anamolyTokenArrEle)[0];
        let tokenValue = Object.values(anamolyTokenArrEle)[0];

        if (tokenString != '') {
          let hexcode = getTokenHexcode(tokenString);
          if (hexcode !== '') {
            if (hindiVowelSignArr.includes(tokenString) || taVowelSignArr.includes(tokenString)) { } else {
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

      let createScoreData = {
        user_id: CreateLearnerProfileDto.user_id,
        session: {
          session_id: CreateLearnerProfileDto.session_id,
          language: language,
          original_text: CreateLearnerProfileDto.original_text,
          response_text: responseText,
          confidence_scores: confidence_scoresArr,
          anamolydata_scores: anomaly_scoreArr,
          missing_token_scores: missing_token_scoresArr,
          asrOutput: JSON.stringify(CreateLearnerProfileDto.output)
        }
      };

      // Store Array to DB
      let data = this.scoresService.create(createScoreData);

      function getTokenHexcode(token: string) {
        let result = tokenHexcodeDataArr.find(item => item.token === token);
        return result?.hexcode || '';
      }


      return response.status(HttpStatus.CREATED).send({ status: 'success', missingTokens: missingTokens, correctTokens: correctTokens, confidence_scoresArr: confidence_scoresArr, anomaly_scoreArr: anomaly_scoreArr, tokenArr: tokenArr, anamolyTokenArr: anamolyTokenArr, missing_token_scoresArr: missing_token_scoresArr })
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
        original_text: { type: 'string', example: 'விமானம் வானில் பறக்கின்றது' },
        audio: { type: 'string', example: 'Add tamil Wav file base64 string here' },
        user_id: { type: 'string', example: '8635444062' },
        session_id: { type: 'string', example: '86354440621701972584385' },
        language: { type: 'string', example: 'ta' },
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
  @ApiOperation({ summary: 'Store students learner ai profile, from the ASR output for a given wav file. This API will work for Tamil' })
  @Post('/updateLearnerProfile/ta')
  async updateLearnerProfileTa(@Res() response: FastifyReply, @Body() CreateLearnerProfileDto: CreateLearnerProfileDto) {
    try {
      if (CreateLearnerProfileDto['output'] === undefined && CreateLearnerProfileDto.audio !== undefined) {
        let audioFile = CreateLearnerProfileDto.audio;
        const decoded = audioFile.toString('base64');
        let audioOutput = await this.scoresService.audioFileToAsrOutput(decoded, CreateLearnerProfileDto.language);
        CreateLearnerProfileDto['output'] = audioOutput.output;
      }

      let confidence_scoresArr = [];
      let missing_token_scoresArr = [];
      let anomaly_scoreArr = [];

      let originalText = CreateLearnerProfileDto.original_text;
      let responseText = CreateLearnerProfileDto.output[0].source;
      let originalTextTokensArr = originalText.split("");
      let responseTextTokensArr = responseText.split("");

      let originalTextArr = originalText.split(" ");
      let responseTextArr = responseText.split(" ");

      let originalTextWordCount = [];

      // for (let originalTextSetEle of new Set(originalTextArr)) {
      //   let wordCount = 0;
      //   for (let originalTextArrEle of originalTextArr) {
      //     if (originalTextSetEle === originalTextArrEle) {
      //       wordCount++;
      //     }
      //   }
      //   originalTextWordCount.push({ word: originalTextSetEle, count: wordCount });
      // }

      // for (let originalTextWordCountEle of originalTextWordCount) {
      //   let count = 0;
      //   for (let responseTextArrEle of responseTextArr) {
      //     if (originalTextWordCountEle.word === responseTextArrEle) {
      //       count++;
      //     }
      //   }
      //   if (count != 0 && originalTextWordCountEle.count < count) {
      //     return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      //       status: "error",
      //       message: "Avoid repetitions and record again"
      //     });
      //   }
      // }

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

      for (let responseTextELE of responseText.split("")) {
        if (responseTextELE != ' ') {
          if (vowelSignArr.includes(responseTextELE)) {
            if (isPrevVowel) {
              // let prevEleArr = prevEle.split("");
              // prevEle = prevEleArr[0] + responseTextELE;
              // responseTokenArr.push(prevEle);
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

      //console.log(filteredTokenArr);

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
              if (!missingTokens.includes(value.charkey) && !responseTokenArr.includes(value.charkey)) {
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

      let createScoreData = {
        user_id: CreateLearnerProfileDto.user_id,
        session: {
          session_id: CreateLearnerProfileDto.session_id,
          language: language,
          original_text: CreateLearnerProfileDto.original_text,
          response_text: responseText,
          confidence_scores: confidence_scoresArr,
          anamolydata_scores: anomaly_scoreArr,
          missing_token_scores: missing_token_scoresArr,
          asrOutput: JSON.stringify(CreateLearnerProfileDto.output)
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
        original_text: { type: 'string', example: 'आपसे मिलकर अच्छा लगा' },
        audio: { type: 'string', example: 'Add hindi Wav file base64 string here' },
        user_id: { type: 'string', example: '1390074473' },
        session_id: { type: 'string', example: '13900744731701973109305' },
        language: { type: 'string', example: 'hi' },
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
        let audioOutput = await this.scoresService.audioFileToAsrOutput(decoded, CreateLearnerProfileDto.language);
        CreateLearnerProfileDto['output'] = audioOutput.output;
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

      let createScoreData = {
        user_id: CreateLearnerProfileDto.user_id,
        session: {
          session_id: CreateLearnerProfileDto.session_id,
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
        original_text: { type: 'string', example: 'ಆಕಾಶನ ಮನೆಯು ಅಂಗಡಿಯ ಹತ್ತಿರ ಇದೆ' },
        audio: { type: 'string', example: 'Add kannada Wav file base64 string here' },
        user_id: { type: 'string', example: '8550552703' },
        session_id: { type: 'string', example: '85505527031701973332940' },
        language: { type: 'string', example: 'kn' },
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

      if (CreateLearnerProfileDto['output'] === undefined && CreateLearnerProfileDto.audio !== undefined) {
        let audioFile = CreateLearnerProfileDto.audio;
        const decoded = audioFile.toString('base64');
        let audioOutput = await this.scoresService.audioFileToAsrOutput(decoded, CreateLearnerProfileDto.language);
        CreateLearnerProfileDto['output'] = audioOutput.output;
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

      let kannadaVowelSignArr = ["ಾ", "ಿ", "ೀ", "ು", "ೂ", "ೃ", "ೆ", "ೇ", "ೈ", "ೊ", "ೋ", "ೌ", "ಂ", "ಃ", "ೄ", "್", "ಀ", "ಁ", "಼"];

      let vowelSignArr = [];

      let language = "kn";


      vowelSignArr = kannadaVowelSignArr;

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

      let createScoreData = {
        user_id: CreateLearnerProfileDto.user_id,
        session: {
          session_id: CreateLearnerProfileDto.session_id,
          language: language,
          original_text: CreateLearnerProfileDto.original_text,
          response_text: responseText,
          confidence_scores: confidence_scoresArr,
          missing_token_scores: missing_token_scoresArr,
          anamolydata_scores: anomaly_scoreArr,
          asrOutput: JSON.stringify(CreateLearnerProfileDto.output)
        }
      };

      // Store Array to DB
      let data = this.scoresService.create(createScoreData);

      function getTokenHexcode(token: string) {
        let result = tokenHexcodeDataArr.find(item => item.token.trim() === token.trim());
        return result?.hexcode || '';
      }

      return response.status(HttpStatus.CREATED).send({ status: 'success', msg: "Successfully stored data to learner profile", responseText: responseText, originalTokenArr: originalTokenArr, correctTokens: correctTokens, responseTokenArr: responseTokenArr, createScoreData: createScoreData, tokenArr: tokenArr, anamolyTokenArr: anamolyTokenArr })
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
  GetTargetsbySession(@Param('sessionId') id: string) {
    return this.scoresService.getTargetsBySession(id);
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
  GetTargetsbyUser(@Param('userId') id: string) {
    return this.scoresService.getTargetsByUser(id);
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
  GetFamiliarityBysession(@Param('sessionId') id: string) {
    return this.scoresService.getFamiliarityBySession(id);
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
  GetFamiliarityByUser(@Param('userId') id: string) {
    return this.scoresService.getFamiliarityByUser(id);
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
  async GetContentWordbyUser(@Param('userId') id: string, @Query('language') language: string, @Query() { contentlimit = 5 }, @Query() { gettargetlimit = 5 }, @Query() { tags }) {
    let getGetTarget = await this.scoresService.getTargetsByUser(id, language);
    let getGetTargetCharArr = getGetTarget.filter((getGetTargetEle, index) => {
      if (index >= gettargetlimit) {
        return false;
      }
      return true;
    }).map(charData => {
      return charData.character
    });

    const url = process.env.ALL_CONTENT_SERVICE_API;

    const textData = {
      "tokenArr": getGetTargetCharArr,
      "language": language || "ta",
      "contentType": "Word",
      "limit": contentlimit || 5,
      "tags": tags
    };

    const newContent = await lastValueFrom(
      this.httpService.post(url, JSON.stringify(textData), {
        headers: {
          'Content-Type': 'application/json',
        }
      }).pipe(
        map((resp) => resp.data)
      )
    );


    return { content: newContent.data, getTargetChar: getGetTargetCharArr };
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
  async GetContentSentencebyUser(@Param('userId') id: string, @Query('language') language, @Query() { contentlimit = 5 }, @Query() { gettargetlimit = 5 }, @Query() { tags }) {
    console.log(typeof tags);
    if (!Array.isArray(tags)) {
      tags = Array.of(tags);
    }

    let getGetTarget = await this.scoresService.getTargetsByUser(id, language);
    let getGetTargetCharArr = getGetTarget.filter((getGetTargetEle, index) => {
      if (index >= gettargetlimit) {
        return false;
      }
      return true;
    }).map(charData => {
      return charData.character
    });

    const url = process.env.ALL_CONTENT_SERVICE_API;

    const textData = {
      "tokenArr": getGetTargetCharArr,
      "language": language || "ta",
      "contentType": "Sentence",
      "limit": contentlimit || 5,
      "tags": tags
    };

    const newContent = await lastValueFrom(
      this.httpService.post(url, JSON.stringify(textData), {
        headers: {
          'Content-Type': 'application/json',
        }
      }).pipe(
        map((resp) => resp.data)
      )
    );


    return { content: newContent.data, getTargetChar: getGetTargetCharArr };
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
  async GetContentParagraphbyUser(@Param('userId') id: string, @Query('language') language, @Query() { contentlimit = 5 }, @Query() { gettargetlimit = 5 }, @Query() { tags }) {
    let getGetTarget = await this.scoresService.getTargetsByUser(id, language);
    let getGetTargetCharArr = getGetTarget.filter((getGetTargetEle, index) => {
      if (index >= gettargetlimit) {
        return false;
      }
      return true;
    }).map(charData => {
      return charData.character
    });

    const url = process.env.ALL_CONTENT_SERVICE_API;

    const textData = {
      "tokenArr": getGetTargetCharArr,
      "language": language || "ta",
      "contentType": "Paragraph",
      "limit": contentlimit || 5,
      "tags": tags
    };

    const newContent = await lastValueFrom(
      this.httpService.post(url, JSON.stringify(textData), {
        headers: {
          'Content-Type': 'application/json',
        }
      }).pipe(
        map((resp) => resp.data)
      )
    );


    return { content: newContent.data, getTargetChar: getGetTargetCharArr };
  }

  @ApiParam({
    name: "userId",
    example: "2020076506"
  })
  @Get('/getlearningstatus/user/:userId')
  @ApiOperation({ summary: 'Get Learning status by user id' })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Success response with Get Targets character and score for user id',
  //   schema: {
  //     properties: {
  //       character: { type: 'string' },
  //       score: { type: 'number', format: 'float' },
  //     }
  //   },
  // })
  async getLearningStatusbyUser(@Param('userId') id: string) {
    let targets = await this.scoresService.getTargetsByUser(id, 'ta');
    let validations = await this.scoresService.getAssessmentRecords(id);

    return { targets: targets, targetsCount: targets.length, validations: validations, validationsCount: validations.length };
  }

  @ApiExcludeEndpoint(true)
  @Get('/GetMeanScore/user/:userId')
  @ApiOperation({ summary: 'Mean score of each character by user id' })
  @ApiResponse({
    status: 200,
    description: 'Success response with Get Mean score of each character by user id across the learning sessions',
    schema: {
      properties: {
        token: { type: 'string' },
        mean: { type: 'number', format: 'float' },
      }
    },
  })
  GetMeanScoreLearnerByUser(@Param('userId') id: string) {
    return this.scoresService.getMeanLearnerByUser(id);
  }

  @ApiExcludeEndpoint(true)
  @Get('/GetMeanScore/session/:sessionId')
  @ApiOperation({ summary: 'Mean score of each character by session id' })
  @ApiResponse({
    status: 200,
    description: 'Success response with Get Mean score of each character by session id across the learning sessions',
    schema: {
      properties: {
        token: { type: 'string' },
        mean: { type: 'number', format: 'float' },
      }
    },
  })
  GetMeanScoreLearnerBySession(@Param('sessionId') id: string) {
    return this.scoresService.getMeanLearnerBySession(id);
  }

  @ApiExcludeEndpoint(true)
  @Get('/GetConfidentVector/user/:userId')
  @ApiOperation({ summary: 'Confident Vector of Learner Profile, that provides a score against each character by given user id evaluated by the Learner AI' })
  @ApiResponse({
    status: 200,
    description: 'Confident Vector of Learner Profile, that provides a score against each character by given user id evaluated by the Learner AI',
    schema: {
      properties: {
        token: { type: 'string' },
        median: { type: 'number', format: 'float' },
      }
    },
  })
  GetConfidentVectorLearnerByUser(@Param('userId') id: string) {
    return this.scoresService.getConfidentVectorByUser(id);
  }

  @ApiExcludeEndpoint(true)
  @Get('/GetConfidentVector/session/:sessionId')
  @ApiOperation({ summary: 'Confident Vector of Learner Profile, that provides a score against each character by given session id evaluated by the Learner AI' })
  @ApiResponse({
    status: 200,
    description: 'Success response with Confident Vector of Learner Profile for each character by session id',
    schema: {
      properties: {
        token: { type: 'string' },
        median: { type: 'number', format: 'float' },
      }
    },
  })
  GetConfidentVectorLearnerBySession(@Param('sessionId') id: string) {
    return this.scoresService.getConfidentVectorBySession(id);
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

}
