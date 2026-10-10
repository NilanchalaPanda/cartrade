"use strict";
class IdentityController {
  constructor(identityService) {
    this.identityService = identityService;
  }
  register = async (req, res) => {
    const { identityName, enrollmentId, org, role, affiliation } = req.body;
    if (!identityName || !enrollmentId || !org) {
      return res
        .status(400)
        .json({
          success: false,
          error: "identityName, enrollmentId and org are required",
        });
    }
    const result = await this.identityService.registerUser({
      identityName,
      enrollmentId,
      org,
      role,
      affiliation,
    });
    return res.status(201).json({ success: true, data: result });
  };
  enroll = async (req, res) => {
    const { identityName, enrollmentId, enrollmentSecret, org } = req.body;
    if (!identityName || !enrollmentId || !enrollmentSecret || !org) {
      return res
        .status(400)
        .json({
          success: false,
          error:
            "identityName, enrollmentId, enrollmentSecret and org are required",
        });
    }
    const result = await this.identityService.enrollUser({
      identityName,
      enrollmentId,
      enrollmentSecret,
      org,
    });
    return res.status(201).json({ success: true, data: result });
  };
  list = async (req, res) =>
    res.json({
      success: true,
      data: await this.identityService.listIdentities(),
    });
}
module.exports = { IdentityController };
