#include "SatisfactoryOpsPortHologram.h"

void ASatisfactoryOpsPortHologram::InitializeBuildableClass(TSubclassOf<AFGBuildable> BuildableClass)
{
    mBuildClass = BuildableClass;
    mCreateClearanceSnapMeshVisualization = true;
}

UStaticMeshComponent* ASatisfactoryOpsPortHologram::GetClearanceVisualization() const
{
    return mClearanceSnapMeshVisualization;
}

TArray<UStaticMeshComponent*> ASatisfactoryOpsPortHologram::CreateFactoryPortMeshes(
    UFGFactoryConnectionComponent* Connection,
    USceneComponent* AttachParent)
{
    return SetupFactoryConnectionMesh(Connection, true, true, AttachParent);
}

TArray<UStaticMeshComponent*> ASatisfactoryOpsPortHologram::CreatePowerPortMeshes(
    UFGPowerConnectionComponent* Connection,
    USceneComponent* AttachParent)
{
    return SetupPowerConnectionMesh(Connection, AttachParent);
}

TArray<UStaticMeshComponent*> ASatisfactoryOpsPortHologram::CreatePipePortMeshes(
    UFGPipeConnectionComponentBase* Connection,
    USceneComponent* AttachParent)
{
    return SetupPipeConnectionMesh(Connection, true, true, AttachParent);
}
