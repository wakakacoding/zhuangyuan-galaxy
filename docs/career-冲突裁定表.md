# careers 冲突裁定表（构建期自动生成 · 勿手工编辑）

> **优先级口径**：深度档案 YAML（`data/persons/*.yaml`）> 人工考据（`data/careers.yaml`）> 脚本挖掘（`data/seed/careers-mined-qing.yaml`）。
> **规则（M5-d D2）**：回填**仅补缺**——深档已写出的字段一律不被覆盖；两者给出不同值时逐条留痕于此，不再静默。
> **裁定方式**：在 `data/seed/career-override-reviewed.json` 的 `overrides` 内加 `{ "id", "field", "value", "reason" }`；`value` 只能在**深档值 / 回填值**中择一，`reason` 必填（如周延儒「赐死结局刻意降级」）。未在 `overrides` 中列出的冲突按默认「保留深档」处理，并在 `kept_deep` 中登记。
> **数据指纹**：`c2929ecfbc6d50fe`（roster.tsv + careers.yaml + careers-mined-qing.yaml + career-override-reviewed.json）

**冲突 57 条 / 31 人** ｜ 待裁定 **0** ｜ 已裁定·覆写 **5** ｜ 已裁定·保留深档 **52**

## 一、待裁定（0 条）

（无）

## 二、已裁定 · 覆写回填值（5 条）

| id | 姓名 | 字段 | 深档值（被覆盖） | 回填值（生效） | 回填来源 | 理由 |
| --- | --- | --- | --- | --- | --- | --- |
| z0219 | 陈尧叟 | `first_category` | 地方 | 部院 | careers.yaml | 深档原值自标「推定」（州县幕职）；s0003 载夺魁授「光禄寺丞、直史馆」，属部院系明确著录，优于推定值 |
| z0233 | 陈尧咨 | `first_category` | 地方 | 部院 | careers.yaml | 深档原值自标「推定」（州县官）；s0003 载「将作监丞」，为宋制状元初授官通例，实证优于推定 |
| z0242 | 梁固 | `first_category` | 地方 | 部院 | careers.yaml | 深档「密州监丞」疑为官称与差遣（通判密州）混写；s0003 载「将作监丞」，与宋制状元初授一致 |
| z0465 | 马铎 | `final_category` | 其他 | 学政文教 | careers.yaml | 深档「其他」为空分类；马铎终官仍为翰林院系（修撰/侍讲），归学政文教信息量与既有归类似例更贴 |
| z0587 | 毕沅 | `first_category` | 部院 | 翰林院 | seed/careers-mined-qing.yaml | 字段定义为「夺魁后首授官职」，深档原值取的是夺魁**前**之内阁中书、军机处行走；夺魁后首授为翰林院修撰 |

## 三、已裁定 · 保留深档（52 条）

| id | 姓名 | 字段 | 深档值（生效） | 回填值（未采用） | 回填来源 | 裁定 |
| --- | --- | --- | --- | --- | --- | --- |
| z0002 | 婁師德 | `final_office` | 纳言、天兵军大总管（赠凉州都督，谥贞） | 同凤阁鸾台平章事（宰相） | careers.yaml | 保留深档（默认） |
| z0178 | 王溥 | `final_office` | 太子太师、祁国公（四朝宰相） | 司空（入宋） | careers.yaml | 保留深档（默认） |
| z0215 | 梁灏 | `final_office` | 权知开封府（暴病卒于任） | 卒年四十二 | careers.yaml | 保留深档（默认） |
| z0219 | 陈尧叟 | `first_office` | 州县幕职（推定） | 光禄寺丞、直史馆 | careers.yaml | 保留深档（默认） |
| z0219 | 陈尧叟 | `final_office` | 同中书门下平章事（谥文忠） | 同平章事（宰相） | careers.yaml | 保留深档（默认） |
| z0222 | 孙何 | `first_office` | 将作监丞、通判陕州 | 节度推官 | careers.yaml | 保留深档（默认） |
| z0222 | 孙何 | `final_office` | 知制诰、判太常礼院（病卒） | 卒年四十四 | careers.yaml | 保留深档（默认） |
| z0226 | 张俭 | `final_office` | 太师、中书令（封陈王，加尚父） | 左丞相（辽圣宗、兴宗两朝名臣） | careers.yaml | 保留深档（默认） |
| z0233 | 陈尧咨 | `first_office` | 州县官（推定） | 将作监丞 | careers.yaml | 保留深档（默认） |
| z0233 | 陈尧咨 | `final_office` | 武信军节度使（谥康肃） | 武信军节度使、知天雄军 | careers.yaml | 保留深档（默认） |
| z0242 | 梁固 | `first_office` | 密州监丞 | 将作监丞 | careers.yaml | 保留深档（默认） |
| z0242 | 梁固 | `final_office` | 户部判官（早逝） | 卒年三十三 | careers.yaml | 保留深档（默认） |
| z0412 | 留梦炎 | `final_office` | 宋左丞相 → 元礼部尚书、翰林学士承旨 | 右丞相兼枢密使（后降元） | careers.yaml | 保留深档（默认） |
| z0427 | 泰不华 | `first_category` | 学政文教 | 翰林院 | careers.yaml | 显式保留深档：首授集贤殿修撰属集贤院，非翰林院；回填值系机械归类（同为「集贤殿修撰」却落翰林院） |
| z0427 | 泰不华 | `final_office` | 浙东道宣慰使都元帅（殉国，封魏国公，谥忠介） | 台州路达鲁花赤，战方国珍死 | careers.yaml | 保留深档（默认） |
| z0436 | 李齐 | `final_office` | 高邮府知府（殉国） | 高邮知府，城陷为张士诚所杀 | careers.yaml | 保留深档（默认） |
| z0465 | 马铎 | `final_office` | 卒于任（治河、平边） | 翰林院修撰（卒于官） | careers.yaml | 保留深档（默认） |
| z0477 | 彭時 | `final_office` | 内阁首辅、少保（赠太师，谥文宪） | 文渊阁大学士 | careers.yaml | 保留深档（默认） |
| z0531 | 周延儒 | `final_office` | 内阁首辅、太子太师（赐死） | 首辅，崇祯赐死 | careers.yaml | 保留深档（默认） |
| z0531 | 周延儒 | `final_category` | 宰辅 | 其他 | careers.yaml | 显式保留深档：两任内阁首辅，终点即宰辅；回填「其他」系早期考据按赐死结局刻意降级，M5-d 裁定回归宰辅 |
| z0534 | 文震孟 | `final_office` | 礼部左侍郎兼东阁大学士 | 东阁大学士（崇祯入阁） | careers.yaml | 保留深档（默认） |
| z0542 | 吕宫 | `first_office` | 秘书院修撰 | 翰林院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0542 | 吕宫 | `final_office` | 弘文院大学士、太子太保（引咎归里） | 太子太保、內翰林弘文院大學士 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0543 | 刘子壮 | `first_office` | 国史馆修撰 | 翰林院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0543 | 刘子壮 | `final_office` | 国史馆修撰（会试同考官，病卒） | 內翰林國史院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0545 | 邹忠倚 | `first_office` | 秘书院修撰 | 翰林院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0545 | 邹忠倚 | `final_office` | 秘书院修撰（病卒） | 內翰林祕書院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0553 | 蔡启僔 | `first_office` | 翰林院修撰、日讲官 | 翰林院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0553 | 蔡启僔 | `final_office` | 翰林院检讨（病退） | 右春坊右贊善 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0553 | 蔡启僔 | `final_category` | 归隐 | 学政文教 | seed/careers-mined-qing.yaml | 显式保留深档：终点「翰林院检讨（病退）」与归隐自洽（对照 z0483 羅倫 讲学终老落归隐） |
| z0555 | 彭定求 | `final_office` | 《全唐诗》总裁（扬州书局） | 翰林院侍讲，辞官归乡讲学 | careers.yaml + seed/careers-mined-qing.yaml<br>（另值 seed/careers-mined-qing.yaml：翰林院侍講） | 保留深档（默认） |
| z0555 | 彭定求 | `final_category` | 学政文教 | 归隐 | careers.yaml | 显式保留深档：口径偏好项，两说皆通；取深档（终点为奉敕编书之职《全唐诗》总裁） |
| z0557 | 蔡升元 | `first_office` | 翰林院修撰（入直南书房） | 翰林院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0557 | 蔡升元 | `final_office` | 礼部尚书 | 禮部尚書 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0558 | 陆肯堂 | `final_office` | 翰林院侍读学士（早逝） | 翰林院侍讀學士 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0563 | 汪绎 | `final_office` | 翰林院修撰（早逝） | 翰林院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0570 | 汪应铨 | `final_office` | 左春坊赞善 | 左春坊贊善 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0572 | 于振 | `first_office` | 翰林院修撰（入直南书房） | 翰林院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0572 | 于振 | `final_office` | 行人司司副 | 翰林院侍讀學士、日講起居注官 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0572 | 于振 | `final_category` | 其他 | 学政文教 | seed/careers-mined-qing.yaml | 显式保留深档：终点为乾隆初再起之行人司司副，非文教职；回填取其被贬前的湖北学政 |
| z0574 | 彭启丰 | `first_office` | 翰林院编修、侍讲 | 翰林院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0574 | 彭启丰 | `final_office` | 兵部尚书（晚主讲紫阳书院） | 兵部尚書、經筵講官 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0578 | 于敏中 | `final_office` | 文华殿大学士、军机大臣（谥文襄，身后夺祠） | 太子太保、文華殿大學士、兼管翰林院掌院學士、上書房總師傅 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0585 | 莊培因 | `first_office` | 翰林院修撰（此前以举人考授中书入军机房） | 翰林院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0585 | 莊培因 | `final_office` | 福建学政（卒于任） | 翰林院侍講學士、福建學政 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0587 | 毕沅 | `first_office` | 内阁中书、军机处行走（夺魁后翰林修撰） | 翰林院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0587 | 毕沅 | `final_office` | 湖广总督（赠太子太保，身后夺世职） | 太子太保、湖廣總督 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0637 | 翁曾源 | `first_office` | 翰林院修撰、国史馆纂修 | 翰林院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0637 | 翁曾源 | `final_office` | 翰林院修撰（病归，书画终老） | 翰林院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0637 | 翁曾源 | `final_category` | 归隐 | 学政文教 | seed/careers-mined-qing.yaml | 显式保留深档：终点「翰林院修撰（病归，书画终老）」，归隐性质明确 |
| z0641 | 陆润庠 | `first_office` | 翰林院修撰、南书房行走 | 翰林院修撰 | seed/careers-mined-qing.yaml | 保留深档（默认） |
| z0641 | 陆润庠 | `final_office` | 体仁阁大学士、溥仪之师（谥文端） | 太傅、東閣大學士、弼德院院長 | seed/careers-mined-qing.yaml | 保留深档（默认） |

## 四、字段分布

| 字段 | 冲突条数 | 待裁定 | 已裁定·覆写 |
| --- | --- | --- | --- |
| `first_office` | 15 | 0 | 0 |
| `first_category` | 5 | 0 | 4 |
| `final_office` | 31 | 0 | 0 |
| `final_category` | 6 | 0 | 1 |

## 五、建议复核（建议项，未生效 · 待 X2 确认）

> 下表是「默认保留深档」看似可疑的条目与理由，**仅作建议、不参与构建**。确认后把结论写入 `overrides`（采纳回填）或 `kept_deep`（保留深档），并删除本文件对应 `review_hints`。

（无）

---

*由 `scripts/build-data.ts` 在每次 `npm run build:data` 时自动校验并重写（内容无变化则跳过写入，指纹 `c2929ecfbc6d50fe`）。*
