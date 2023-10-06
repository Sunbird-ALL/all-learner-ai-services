import { Controller, Get, Post, Body, Patch, Param, Delete, HttpStatus, Res } from '@nestjs/common';
import { ScoresService } from './scores.service';
import { CreateLearnerProfileDto } from './dto/CreateLearnerProfile.dto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ApiExcludeEndpoint, ApiForbiddenResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('scores')
@Controller('scores')
export class ScoresController {
  constructor(
    private readonly scoresService: ScoresService
  ) { }

  @ApiExcludeEndpoint(true)
  @Post()
  async create(@Res() response: FastifyReply, @Body() createScoreDto: CreateLearnerProfileDto) {
    try {

      let confidence_scoresArr = [];
      let anomaly_scoreArr = [];

      let originalText = createScoreDto.original_text;
      let responseText = createScoreDto.output[0].source;
      let originalTextTokensArr = originalText.split("");
      let responseTextTokensArr = responseText.split("");

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

      let language = createScoreDto?.language || "ta";

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
              if (language !== 'hi') {
                let prevEleArr = prevEle.split("");
                prevEle = prevEleArr[0] + originalTextELE;
                originalTokenArr.push(prevEle);
              } else {
                prevEle = prevEle + originalTextELE;
                originalTokenArr.push(prevEle);
              }
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
              if (language !== 'hi') {
                let prevEleArr = prevEle.split("");
                prevEle = prevEleArr[0] + responseTextELE;
                responseTokenArr.push(prevEle);
              } else {
                prevEle = prevEle + responseTextELE;
                responseTokenArr.push(prevEle);
              }
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

      let filteredTokenArr = [];

      //token list for ai4bharat response
      let tokenArr = [];
      let anamolyTokenArr = [];

      // Create Single Array from AI4bharat tokens array
      createScoreDto.output[0].nBestTokens.forEach(element => {
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
        } else {
          identification_status = 0;
        }

        if (value.charkey !== "" && value.charkey !== "▁") {
          if (missingTokens.includes(value.charkey) || correctTokens.includes(value.charkey)) {
            let hexcode = getTokenHexcode(value.charkey);

            if (hexcode !== '' || language === 'hi') {
              confidence_scoresArr.push(
                {
                  token: value.charkey,
                  hexcode: hexcode,
                  confidence_score: missingTokens.includes(value.charkey) && !correctTokens.includes(value.charkey) ? 0.10 : value.charvalue,
                  identification_status: missingTokens.includes(value.charkey) ? 0 : identification_status
                }
              );
            }
          }
          else {
            let hexcode = getTokenHexcode(value.charkey);

            if (hexcode !== '' || language === 'hi') {
              confidence_scoresArr.push(
                {
                  token: value.charkey,
                  hexcode: hexcode,
                  confidence_score: 0.10,
                  identification_status: 0
                }
              );
            }
          }
        }
      }

      for (let missingTokensEle of missingTokens) {
        let hexcode = getTokenHexcode(missingTokensEle);

        if (hexcode !== '' || language === 'hi') {
          if (hindiVowelSignArr.includes(missingTokensEle) || taVowelSignArr.includes(missingTokensEle)) { } else {
            confidence_scoresArr.push(
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
          if (hexcode !== '' || language === 'hi') {
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
        user_id: createScoreDto.user_id,
        session: {
          session_id: createScoreDto.session_id,
          language: language,
          original_text: createScoreDto.original_text,
          response_text: responseText,
          confidence_scores: confidence_scoresArr,
          anamolydata_scores: anomaly_scoreArr
        }
      };

      // Store Array to DB
      let data = this.scoresService.create(createScoreData);

      function getTokenHexcode(token: string) {
        let result = tokenHexcodeDataArr.find(item => item.token === token);
        return result?.hexcode || '';
      }

      return response.status(HttpStatus.CREATED).send({ status: 'success', missingTokens: missingTokens, correctTokens: correctTokens, confidence_scoresArr: confidence_scoresArr, anomaly_scoreArr: anomaly_scoreArr, tokenArr: tokenArr, anamolyTokenArr: anamolyTokenArr })
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

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
  @ApiOperation({ summary: 'Store students learner ai profile, from the ASR output for a given wav file' })
  @Post('/updateLearnerProfile')
  async updateLearnerProfile(@Res() response: FastifyReply, @Body() createScoreDto: CreateLearnerProfileDto) {
    try {
      let audioFile = createScoreDto.audio;
      const decoded = audioFile.toString('base64');
      let audioOutput = await this.scoresService.audioFileToAsrOutput(decoded, createScoreDto.language);
      createScoreDto['output'] = audioOutput.output;

      let confidence_scoresArr = [];
      let anomaly_scoreArr = [];

      let originalText = createScoreDto.original_text;
      let responseText = createScoreDto.output[0].source;
      let originalTextTokensArr = originalText.split("");
      let responseTextTokensArr = responseText.split("");

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

      let language = createScoreDto?.language || "ta";

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
              if (language !== 'hi') {
                let prevEleArr = prevEle.split("");
                prevEle = prevEleArr[0] + originalTextELE;
                originalTokenArr.push(prevEle);
              } else {
                prevEle = prevEle + originalTextELE;
                originalTokenArr.push(prevEle);
              }
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
              if (language !== 'hi') {
                let prevEleArr = prevEle.split("");
                prevEle = prevEleArr[0] + responseTextELE;
                responseTokenArr.push(prevEle);
              } else {
                prevEle = prevEle + responseTextELE;
                responseTokenArr.push(prevEle);
              }
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

      let filteredTokenArr = [];

      //token list for ai4bharat response
      let tokenArr = [];
      let anamolyTokenArr = [];

      // Create Single Array from AI4bharat tokens array
      createScoreDto.output[0].nBestTokens.forEach(element => {
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
        } else {
          identification_status = 0;
        }

        if (value.charkey !== "" && value.charkey !== "▁") {
          if (missingTokens.includes(value.charkey) || correctTokens.includes(value.charkey)) {
            let hexcode = getTokenHexcode(value.charkey);

            if (hexcode !== '' || language === 'hi') {
              confidence_scoresArr.push(
                {
                  token: value.charkey,
                  hexcode: hexcode,
                  confidence_score: missingTokens.includes(value.charkey) && !correctTokens.includes(value.charkey) ? 0.10 : value.charvalue,
                  identification_status: missingTokens.includes(value.charkey) ? 0 : identification_status
                }
              );
            }
          }
          else {
            let hexcode = getTokenHexcode(value.charkey);

            if (hexcode !== '' || language === 'hi') {
              confidence_scoresArr.push(
                {
                  token: value.charkey,
                  hexcode: hexcode,
                  confidence_score: 0.10,
                  identification_status: 0
                }
              );
            }
          }
        }
      }

      for (let missingTokensEle of missingTokens) {
        let hexcode = getTokenHexcode(missingTokensEle);

        if (hexcode !== '' || language === 'hi') {
          if (hindiVowelSignArr.includes(missingTokensEle) || taVowelSignArr.includes(missingTokensEle)) { } else {
            confidence_scoresArr.push(
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
          if (hexcode !== '' || language === 'hi') {
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
        user_id: createScoreDto.user_id,
        session: {
          session_id: createScoreDto.session_id,
          language: language,
          original_text: createScoreDto.original_text,
          response_text: responseText,
          confidence_scores: confidence_scoresArr,
          anamolydata_scores: anomaly_scoreArr
        }
      };

      // Store Array to DB
      let data = this.scoresService.create(createScoreData);

      function getTokenHexcode(token: string) {
        let result = tokenHexcodeDataArr.find(item => item.token === token);
        return result?.hexcode || '';
      }

      return response.status(HttpStatus.CREATED).send({ status: 'success', msg: "Successfully stored data to learner profile" })
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiExcludeEndpoint(true)
  @Post('/bulk')
  createBulk(@Res() response: FastifyReply, @Body() createScoreDto: any) {
    try {
      let data = this.scoresService.create(createScoreDto);
      return response.status(HttpStatus.CREATED).send({ status: 'success', msg: 'Successfully Added' })
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @ApiExcludeEndpoint(true)
  @Get()
  findAll() {
    return this.scoresService.findAll();
  }

  @ApiExcludeEndpoint(true)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scoresService.findOne(+id);
  }

  @ApiExcludeEndpoint(true)
  @Get('/byuser/:id')
  findbyUser(@Param('id') id: string) {
    return this.scoresService.findbyUser(id);
  }

  @ApiExcludeEndpoint(true)
  @Get('/bysession/:id')
  findbySession(@Param('id') id: string) {
    return this.scoresService.findbySession(id);
  }

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

  @Get('/GetConfidentSet/session/:sessionId')
  @ApiOperation({ summary: 'Get ConfidentSet character API by session id' })
  @ApiResponse({
    status: 200,
    description: 'Success response with Get ConfidentSet Word character and score for session id',
    schema: {
      properties: {
        character: { type: 'string' },
        score: { type: 'number', format: 'float' },
      }
    },
  })
  GetConfidentSetBysession(@Param('sessionId') id: string) {
    return this.scoresService.getConfidentSetBySession(id);
  }

  @Get('/GetConfidentSet/user/:userId')
  @ApiOperation({ summary: 'Get ConfidentSet character API by user id' })
  @ApiResponse({
    status: 200,
    description: 'Success response with Get Confident Set of character and score for user id',
    schema: {
      properties: {
        character: { type: 'string' },
        score: { type: 'number', format: 'float' },
      }
    },
  })
  GetConfidentSetByUser(@Param('userId') id: string) {
    return this.scoresService.getConfidentSetByUser(id);
  }

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

  @Get('/GetFamiliarityScore/user/:userId')
  @ApiOperation({ summary: 'Familiarity of Learner Profile for each character by user id' })
  @ApiResponse({
    status: 200,
    description: 'Familiarity Vector of Learner Profile, that provides a score against each character by given user id evaluated by the Learner AI',
    schema: {
      properties: {
        token: { type: 'string' },
        median: { type: 'number', format: 'float' },
      }
    },
  })
  GetFamiliarityScoreLearnerByUser(@Param('userId') id: string) {
    return this.scoresService.getFamiliarityLearnerByUser(id);
  }

  @Get('/GetFamiliarityScore/session/:sessionId')
  @ApiOperation({ summary: 'Familiarity Vector of Learner Profile, that provides a score against each character by given session id evaluated by the Learner AI' })
  @ApiResponse({
    status: 200,
    description: 'Success response with Familiarity of Learner Profile for each character by session id',
    schema: {
      properties: {
        token: { type: 'string' },
        median: { type: 'number', format: 'float' },
      }
    },
  })
  GetFamiliarityScoreLearnerBySession(@Param('sessionId') id: string) {
    return this.scoresService.getFamiliarityLearnerBySession(id);
  }
}
