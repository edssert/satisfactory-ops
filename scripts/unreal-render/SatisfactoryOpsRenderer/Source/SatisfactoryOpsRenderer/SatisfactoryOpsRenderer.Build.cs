using UnrealBuildTool;

public class SatisfactoryOpsRenderer : ModuleRules
{
    public SatisfactoryOpsRenderer(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        CppStandard = CppStandardVersion.Cpp20;

        PublicDependencyModuleNames.AddRange(new[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "AbstractInstance",
            "FactoryGame",
            "SML"
        });

        PrivateDependencyModuleNames.AddRange(new[]
        {
            "ImageCore",
            "ImageWrapper",
            "Json",
            "RenderCore",
            "RHI",
            "Projects"
        });
    }
}
